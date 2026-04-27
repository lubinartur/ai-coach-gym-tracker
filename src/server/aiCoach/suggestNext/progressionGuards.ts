/**
 * Post-generation only: cap aggressive LLM/merge output against progression plan,
 * recent history, and weekly volume. Does not change prompts or selection logic.
 */
import { MUSCLE_HYPERTROPHY_SETS_PER_WEEK } from "@/lib/muscleVolumeAnalysis";
import { cap } from "@/lib/string/cap";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { PRIMARY_MUSCLE_GROUPS, type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { buildCatalogLookup, resolveCatalogRowByExerciseName } from "@/services/exerciseCatalogResolve";
import type {
  AiCoachRequestPayload,
  ExerciseBaselineForAi,
  ExerciseHistoryItemForAi,
  ProgressionPlan,
  ProgressionPlanExercise,
  SuggestNextWorkoutResponse,
} from "@/types/aiCoach";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";

const WEIGHT_EPS = 0.2;

type ExerciseRow = SuggestNextWorkoutResponse["exercises"][0];
type ExerciseDecision = ExerciseRow["decision"];

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function maxSetWeight(sets: { weight: number; reps: number }[]): number {
  if (sets.length === 0) return 0;
  return Math.max(0, ...sets.map((s) => s.weight));
}

function getBaseline(
  exName: string,
  baselines: ExerciseBaselineForAi[] | undefined,
): ExerciseBaselineForAi | null {
  if (!baselines?.length) return null;
  const k = normalizeExerciseName(exName);
  return baselines.find((x) => normalizeExerciseName(x.name) === k) ?? null;
}

function getPlanAction(
  name: string,
  plan: ProgressionPlan | undefined,
): ProgressionPlanExercise | null {
  if (!plan?.exercisePlans?.length) return null;
  const k = normalizeExerciseName(name);
  return plan.exercisePlans.find((e) => normalizeExerciseName(e.exerciseName) === k) ?? null;
}

function getExerciseHistoryRow(
  exName: string,
  input: AiCoachRequestPayload,
): ExerciseHistoryItemForAi | null {
  const k = normalizeExerciseName(exName);
  const list = input.aiDecisionContext?.exerciseHistory;
  if (!list?.length) return null;
  return list.find((h) => normalizeExerciseName(h.name) === k) ?? null;
}

/** Last session (vs previous) had a clear weight step-up. */
function lastLogIncreasedWeight(
  exName: string,
  input: AiCoachRequestPayload,
): boolean | null {
  const h = getExerciseHistoryRow(exName, input);
  if (!h?.recent?.length || h.recent.length < 2) return null;
  const r = h.recent;
  const last = r[r.length - 1]!;
  const prev = r[r.length - 2]!;
  return last.topWeight > prev.topWeight + WEIGHT_EPS;
}

function buildMusclesAtOrAboveWeeklyMax(
  input: AiCoachRequestPayload,
  runtime: EngineRuntimeContext,
): Set<PrimaryMuscleGroup> {
  const s = new Set<PrimaryMuscleGroup>();
  for (const m of input.laggingInterventionBlockers?.musclesAtWeeklyVolumeMax ?? []) {
    s.add(m);
  }
  const wk: Partial<Record<PrimaryMuscleGroup, number>> = {
    ...input.weeklyMuscleVolume,
  };
  const ctxW = input.aiDecisionContext?.muscleVolume?.weeklyMuscleVolume;
  if (ctxW) {
    for (const m of PRIMARY_MUSCLE_GROUPS) {
      wk[m] = Math.max(wk[m] ?? 0, ctxW[m] ?? 0);
    }
  }
  const decW = runtime.decision?.muscleVolume?.weeklyMuscleVolume;
  if (decW) {
    for (const m of PRIMARY_MUSCLE_GROUPS) {
      wk[m] = Math.max(wk[m] ?? 0, decW[m] ?? 0);
    }
  }
  const rangeMerge = {
    ...MUSCLE_HYPERTROPHY_SETS_PER_WEEK,
    ...input.muscleHypertrophyRanges,
    ...input.aiDecisionContext?.muscleVolume?.muscleHypertrophyRanges,
  } as Partial<Record<PrimaryMuscleGroup, { min: number; max: number }>>;
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    if (s.has(m)) continue;
    const w = wk[m] ?? 0;
    const b = rangeMerge[m] ?? MUSCLE_HYPERTROPHY_SETS_PER_WEEK[m];
    if (b && w >= b.max) s.add(m);
  }
  return s;
}

function mapPrimaryMuscle(exName: string, catalog: Exercise[]): PrimaryMuscleGroup {
  if (!catalog.length) return "other";
  const row = resolveCatalogRowByExerciseName(exName, buildCatalogLookup(catalog));
  return row?.primaryMuscle ?? "other";
}

function isHighFatigue(input: AiCoachRequestPayload, runtime: EngineRuntimeContext): boolean {
  if (runtime.recovery?.globalFatigueLevel === "high") return true;
  if (input.trainingSignals?.fatigueSignal === "high") return true;
  if (input.aiDecisionContext?.fatigueSignals?.fatigueSignal === "high") return true;
  return false;
}

/**
 * @returns downgraded plan action (high fatigue → treat increase_weight / increase_sets as maintain).
 */
function effectivePlanAction(
  raw: ProgressionPlanExercise["action"],
  highFatigue: boolean,
): ProgressionPlanExercise["action"] {
  if (highFatigue && (raw === "increase_weight" || raw === "increase_sets")) return "maintain";
  return raw;
}

function clampSetWeights(sets: { weight: number; reps: number }[], capW: number): { weight: number; reps: number }[] {
  if (!Number.isFinite(capW) || capW <= 0) return sets;
  return sets.map((st) => ({
    ...st,
    weight: roundHalf(Math.min(st.weight, capW)),
  }));
}

function trimSetCount(
  sets: { weight: number; reps: number }[],
  maxN: number,
): { weight: number; reps: number }[] {
  if (maxN < 1 || sets.length <= maxN) return sets;
  return sets.slice(0, maxN);
}

/**
 * @param prevMaxWeight 0 = unknown
 * @param prevSetCount 0 = unknown
 */
function applyPlanActionRules(
  ex: ExerciseRow,
  action: ProgressionPlanExercise["action"],
  prevMaxWeight: number,
  prevSetCount: number,
  labelName: string,
  exNotes: string[],
): ExerciseRow {
  if (
    action !== "increase_reps" &&
    action !== "maintain" &&
    action !== "reduce_weight" &&
    action !== "reduce_sets"
  ) {
    return ex;
  }
  let out: ExerciseRow = { ...ex, sets: ex.sets.map((s) => ({ ...s })) };
  const wMax0 = maxSetWeight(out.sets);
  const n0 = out.sets.length;

  if (action === "increase_reps") {
    if (prevMaxWeight > 0 && wMax0 > prevMaxWeight + WEIGHT_EPS) {
      out = { ...out, sets: clampSetWeights(out.sets, prevMaxWeight) };
      exNotes.push(
        `Progression guard (${labelName}): cap weight; increase_reps disallows a heavier load.`,
      );
    }
  } else if (action === "maintain") {
    if (prevMaxWeight > 0 && wMax0 > prevMaxWeight + WEIGHT_EPS) {
      out = { ...out, sets: clampSetWeights(out.sets, prevMaxWeight) };
      exNotes.push(`Progression guard (${labelName}): maintain plan — cap weight to last session.`);
    }
    if (prevSetCount > 0 && out.sets.length > prevSetCount) {
      out = { ...out, sets: trimSetCount(out.sets, prevSetCount) };
      exNotes.push(`Progression guard (${labelName}): maintain plan — no extra working sets.`);
    }
  } else if (action === "reduce_weight") {
    if (prevMaxWeight > 0 && maxSetWeight(out.sets) > prevMaxWeight + WEIGHT_EPS) {
      out = { ...out, sets: clampSetWeights(out.sets, prevMaxWeight) };
      exNotes.push(`Progression guard (${labelName}): reduce_weight — do not exceed last working weight.`);
    }
  } else if (action === "reduce_sets") {
    if (prevSetCount > 0 && out.sets.length > prevSetCount) {
      out = { ...out, sets: trimSetCount(out.sets, prevSetCount) };
      exNotes.push(`Progression guard (${labelName}): reduce_sets — cap working sets to last session.`);
    }
    if (prevMaxWeight > 0 && maxSetWeight(out.sets) > prevMaxWeight + WEIGHT_EPS) {
      out = { ...out, sets: clampSetWeights(out.sets, prevMaxWeight) };
    }
  }

  const wMax1 = maxSetWeight(out.sets);
  const n1 = out.sets.length;
  if (n1 < n0 || wMax1 + WEIGHT_EPS < wMax0) {
    if (out.decision === "increase") {
      out = {
        ...out,
        decision: "maintain" as ExerciseDecision,
        decision_label: "Maintain (guarded)",
      };
    }
  }
  return out;
}

function applyRateLimit(
  ex: ExerciseRow,
  prevMaxWeight: number,
  lastIncr: boolean | null,
  labelName: string,
  exNotes: string[],
): ExerciseRow {
  if (lastIncr !== true) return ex;
  if (prevMaxWeight <= 0) return ex;
  const wMax = maxSetWeight(ex.sets);
  if (wMax <= prevMaxWeight + WEIGHT_EPS) return ex;
  exNotes.push(
    `Progression guard (${labelName}): rate limit — no second consecutive weight step; capped to last top weight.`,
  );
  return {
    ...ex,
    sets: clampSetWeights(
      ex.sets.map((s) => ({ ...s })),
      prevMaxWeight,
    ),
    decision: ex.decision === "increase" ? ("maintain" as ExerciseDecision) : ex.decision,
    decision_label: ex.decision === "increase" ? "Maintain (rate limit)" : ex.decision_label,
  };
}

function applyWeeklyVolumeGuard(
  ex: ExerciseRow,
  primary: PrimaryMuscleGroup,
  atMax: Set<PrimaryMuscleGroup>,
  prevSetCount: number,
  labelName: string,
  exNotes: string[],
): ExerciseRow {
  const isBlocked =
    atMax.has(primary) || (primary === "legs" && atMax.has("hamstrings"));
  if (!isBlocked) return ex;
  const n0 = ex.sets.length;
  if (n0 === 0) return ex;

  let capN = n0;
  if (prevSetCount > 0) capN = Math.min(n0, prevSetCount);
  else if (n0 > 3) capN = 3;

  if (capN >= n0) return ex;

  exNotes.push(
    `Progression guard (${labelName}): ${primary} at/above weekly max — no extra working sets; capped to ${capN} sets.`,
  );
  return {
    ...ex,
    sets: trimSetCount(
      ex.sets.map((s) => ({ ...s })),
      capN,
    ),
  };
}

/**
 * @public
 * Called after `applyFatigueBasedProgression` in `finalizeResponse`.
 */
export function applySuggestNextProgressionGuards(
  exercises: SuggestNextWorkoutResponse["exercises"],
  input: AiCoachRequestPayload,
  runtime: EngineRuntimeContext,
  options: { isNewUser: boolean; maxExerciseReason: number },
): {
  exercises: SuggestNextWorkoutResponse["exercises"];
  guardWarnings: string[];
} {
  const highFatigue = isHighFatigue(input, runtime);
  const atMaxMuscles = buildMusclesAtOrAboveWeeklyMax(input, runtime);
  const plan = input.aiDecisionContext?.progressionPlan;
  const baselines = input.trainingSignals?.exerciseBaselines;
  const catalog = input.exerciseCatalog ?? [];
  const allWarnings: string[] = [];
  const maxR = options.maxExerciseReason;

  const out: ExerciseRow[] = exercises.map((ex) => {
    const b = getBaseline(ex.name, baselines);
    const labelName = b?.name || ex.name;
    const latest = b?.latestSets ?? [];
    const prevSetCount = latest.length;
    const prevMaxWeight = latest.length > 0 ? Math.max(0, ...latest.map((s) => s.weight)) : 0;

    const exNotes: string[] = [];
    const planAction = getPlanAction(ex.name, plan);
    const action: ProgressionPlanExercise["action"] | null = planAction
      ? effectivePlanAction(planAction.action, highFatigue)
      : null;

    if (planAction && highFatigue) {
      const raw = planAction.action;
      if (raw === "increase_weight" || raw === "increase_sets") {
        exNotes.push(
          `Progression guard (${labelName}): high fatigue — treating ${raw} as maintain for validation.`,
        );
      }
    }

    let cur: ExerciseRow = { ...ex, sets: ex.sets.map((s) => ({ ...s })) };
    if (action) {
      cur = applyPlanActionRules(cur, action, prevMaxWeight, prevSetCount, labelName, exNotes);
    }

    if (!options.isNewUser) {
      cur = applyRateLimit(
        { ...cur, sets: cur.sets.map((s) => ({ ...s })) },
        prevMaxWeight,
        lastLogIncreasedWeight(ex.name, input),
        labelName,
        exNotes,
      );
    }

    const p = mapPrimaryMuscle(cur.name, catalog);
    cur = {
      ...cur,
      sets: cur.sets.map((s) => ({ ...s })),
    };
    cur = applyWeeklyVolumeGuard(
      { ...cur },
      p,
      atMaxMuscles,
      prevSetCount,
      labelName,
      exNotes,
    );

    for (const w of exNotes) allWarnings.push(w);

    if (exNotes.length) {
      const short = exNotes[exNotes.length - 1]!;
      cur = {
        ...cur,
        reason: (cur.reason ?? "").trim().length
          ? cap(`${cur.reason} ${short}`.trim(), maxR)
          : cap(short, maxR),
      };
    }

    return cur;
  });

  return { exercises: out, guardWarnings: allWarnings };
}
