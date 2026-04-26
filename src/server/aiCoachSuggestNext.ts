import type {
  AiCoachRequestPayload,
  AiTrainingSignalsResponse,
  ExerciseDecision,
  FatigueSignal,
  SuggestNextWorkoutResponse,
  VolumeTrend,
} from "@/types/aiCoach";
import { stripJsonFence } from "@/server/openaiPlanJson";
import { QUICK_WORKOUT_TEMPLATES } from "@/lib/workoutQuickTemplates";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { buildDisplayTrainingSignals } from "@/lib/aiTrainingSignalsFormat";
import { parseAppLanguage } from "@/i18n/language";
import { EMPTY_LAGGING_MUSCLE_BLOCK } from "@/lib/laggingMuscleAnalysis";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { EMPTY_MUSCLE_VOLUME_BLOCK } from "@/lib/muscleVolumeAnalysis";
import { DEFAULT_STIMULUS } from "@/lib/exerciseStimulusScore";
import { EMPTY_PERIODIZATION } from "@/lib/periodizationEngine";
import {
  inferWorkoutSplitFromTitleAndExercises,
  splitRepetitionViolatesGuard,
} from "@/lib/workoutSplitInference";
import { muscleBucket, normalizeSplitLabel } from "@/lib/aiCoach/splitLabels";
import { cap } from "@/lib/string/cap";
import { getExerciseMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { getWorkoutSkeleton, pickExerciseForSlot, type WorkoutSplit } from "@/lib/workoutSkeleton";
import { dedupeExercisesGeneric, repairWorkoutBySkeleton } from "@/lib/workoutRoleRepair";
import {
  createWorkoutInsightsOpenAIClient,
  generateWorkoutInsights,
} from "@/server/generateWorkoutInsights";
import type { ExerciseProgressionForAi } from "@/types/aiCoach";
import {
  MODE_COACH_RECOMMENDED,
  MODE_HISTORY_BASED,
  systemPrompt,
} from "@/server/aiCoach/suggestNext/prompts";
import { openAiSuggestChat } from "@/server/aiCoach/suggestNext/openaiChat";
import {
  computeConfidenceScore,
  mergeConfidence,
  withSuggestNextDevDebug,
} from "@/server/aiCoach/suggestNext/debugAndConfidence";
import { selectWorkoutStructure } from "@/services/exerciseSelectionEngine";
import { parseLoadReps } from "@/lib/loadRepsParser";
import { buildEngineRuntimeContextWithMemory } from "@/services/buildEngineRuntimeContext";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import { evaluateTrainingAdaptation } from "@/services/trainingAdaptationEngine";
import { addTrace } from "@/services/decisionTrace";
import { evaluateLoadManagement } from "@/services/loadManagementEngine";
import type { LoadManagementState } from "@/services/loadManagementEngine";
import { EXERCISE_METADATA_V1 } from "@/data/exerciseMetadata";

const SESSION_TYPES = [
  "Normal progression",
  "Volume focus",
  "Intensity focus",
  "Recovery session",
  "Technique session",
] as const;

const FATIGUE_SET: FatigueSignal[] = ["low", "moderate", "high", "unknown"];
const VOLUME_SET: VolumeTrend[] = ["up", "down", "stable", "unknown"];

const DEFAULT_DECISION_LABEL: Record<ExerciseDecision, string> = {
  increase: "+2.5kg progression",
  maintain: "Maintain weight",
  reduce: "Reduce load",
  technique: "Technique focus",
  volume: "Volume focus",
};

const MAX_LINE = 120;
const MAX_EXERCISE_REASON = 150;

function isFatigue(s: string): s is FatigueSignal {
  return (FATIGUE_SET as string[]).includes(s);
}

function isVolume(s: string): s is VolumeTrend {
  return (VOLUME_SET as string[]).includes(s);
}

// (legacy insight parsing removed; insights derived from decisions)

type ParsedProgrammedExercise = {
  exercise: string;
  sets: number;
  reps: string;
  restSeconds: number;
  load: string;
  progression: string;
};

type ParsedModel = {
  title: string;
  session_type: string;
  reason: string;
  confidence?: number;
  training_signals?: Partial<{
    split: string;
    fatigue: string;
    volume_trend: string;
    strategy: string;
  }>;
  insights?: unknown;
  programmedExercises: ParsedProgrammedExercise[];
  warnings: string[];
};

function parseProgrammedExercisesArray(arr: unknown): ParsedProgrammedExercise[] | null {
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 10) return null;
  const out: ParsedProgrammedExercise[] = [];
  for (const ex of arr) {
    if (!ex || typeof ex !== "object") return null;
    const e = ex as Record<string, unknown>;
    const exercise = typeof e.exercise === "string" ? e.exercise.trim() : "";
    if (!exercise) return null;
    const sets = Number(e.sets);
    const reps = typeof e.reps === "string" ? e.reps.trim() : "";
    const restSeconds = Number(e.restSeconds);
    const load = typeof e.load === "string" ? e.load.trim() : "";
    const progression = typeof e.progression === "string" ? e.progression.trim() : "";
    if (!Number.isFinite(sets) || sets < 1 || sets > 12) return null;
    if (!reps) return null;
    if (!Number.isFinite(restSeconds) || restSeconds < 0 || restSeconds > 1200) return null;
    if (!load) return null;
    if (!progression) return null;
    out.push({
      exercise,
      sets: Math.round(sets),
      reps: cap(reps, 32),
      restSeconds: Math.round(restSeconds),
      load: cap(load, 32),
      progression: cap(progression, 120),
    });
  }
  return out;
}

function parseModelLoose(raw: unknown): ParsedModel | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== "string" || !o.title.trim()) return null;
  if (typeof o.session_type !== "string" || !o.session_type.trim()) {
    return null;
  }
  const sessionTypeNorm = o.session_type.trim();
  if (
    !SESSION_TYPES.includes(
      sessionTypeNorm as (typeof SESSION_TYPES)[number],
    )
  ) {
    return null;
  }
  if (typeof o.reason !== "string" || !o.reason.trim()) return null;
  if (!Array.isArray(o.warnings)) return null;
  const programmedExercises = parseProgrammedExercisesArray(o.programmedExercises);
  if (!programmedExercises) return null;
  const ts = o.training_signals;
  const training_signals =
    ts && typeof ts === "object" ? (ts as ParsedModel["training_signals"]) : undefined;
  return {
    title: o.title.trim(),
    session_type: sessionTypeNorm,
    reason: cap(o.reason.trim(), MAX_LINE),
    confidence: typeof o.confidence === "number" && Number.isFinite(o.confidence)
      ? o.confidence
      : undefined,
    training_signals,
    insights: o.insights,
    programmedExercises,
    warnings: o.warnings.filter(
      (w) => typeof w === "string" && w.trim().length > 0,
    ) as string[],
  };
}

// Insights are now derived from final exercise decisions (post-progression).

function buildTrainingSignalsFromModelOrPayload(
  parsed: ParsedModel,
  input: AiCoachRequestPayload,
): AiTrainingSignalsResponse {
  const tsm = parsed.training_signals;
  if (tsm && typeof tsm === "object") {
    const split = typeof tsm.split === "string" && tsm.split.trim() ? tsm.split.trim() : null;
    const strFat = tsm.fatigue;
    const strVol = tsm.volume_trend;
    const strat = typeof tsm.strategy === "string" && tsm.strategy.trim() ? tsm.strategy.trim() : null;
    if (split && strFat && isFatigue(strFat) && strVol && isVolume(strVol) && strat) {
      return {
        split: cap(split, 160),
        fatigue: strFat,
        volume_trend: strVol,
        strategy: cap(strat, 120),
      };
    }
  }
  return buildDisplayTrainingSignals(
    input.trainingSignals,
    parsed.title,
    parsed.session_type,
  );
}

function parseFirstInt(s: string): number | null {
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

function isRearDeltOrTrapExercise(name: string): boolean {
  const s = name.toLowerCase();
  return (
    s.includes("rear delt") ||
    s.includes("rear deltoid") ||
    s.includes("reverse fly") ||
    s.includes("face pull") ||
    s.includes("trap") ||
    s.includes("shrug")
  );
}

function filterExercisesBySplit(
  exercises: SuggestNextWorkoutResponse["exercises"],
  split: "push" | "pull" | "legs" | "full" | "unknown",
): SuggestNextWorkoutResponse["exercises"] {
  if (split === "unknown" || split === "full") return exercises;
  return exercises.filter((ex) => {
    const g = getExerciseMuscleGroup(ex.name);
    if (split === "push") {
      return g === "chest" || g === "shoulders" || g === "triceps";
    }
    if (split === "pull") {
      // Allow rear delts/traps as shoulder work on pull days.
      if (g === "shoulders") return isRearDeltOrTrapExercise(ex.name);
      return g === "back" || g === "biceps" || g === "core" || g === "forearms";
    }
    // legs
    return g === "legs" || g === "hamstrings" || g === "calves";
  });
}

function toSkeletonSplit(split: "push" | "pull" | "legs" | "full" | "unknown"): WorkoutSplit | null {
  if (split === "pull") return "Pull";
  if (split === "push") return "Push";
  if (split === "legs") return "Legs";
  return null;
}

function buildDefaultWorkingSetsForExercise(
  name: string,
  input: AiCoachRequestPayload,
): { weight: number; reps: number }[] {
  const base = (input.trainingSignals?.exerciseBaselines ?? []).find(
    (b) => normalizeExerciseName(b.name) === normalizeExerciseName(name),
  );
  const last = base?.latestSets?.find((s) => (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0) ?? null;
  const w = last ? Math.max(0, Number(last.weight) || 0) : 20;
  const r = last ? Math.max(0, Math.round(Number(last.reps) || 0)) : 10;
  return [{ weight: w, reps: r }, { weight: w, reps: r }, { weight: w, reps: r }];
}

function buildExercisesFromStructureAndProgramming(input: {
  payload: AiCoachRequestPayload;
  structure: ReturnType<typeof selectWorkoutStructure>;
  programmed: ParsedProgrammedExercise[];
  runtime: EngineRuntimeContext;
  loadManagement?: LoadManagementState;
}): { exercises: SuggestNextWorkoutResponse["exercises"]; warnings: string[] } {
  const warnings: string[] = [];
  const byExercise = new Map<string, ParsedProgrammedExercise>();
  for (const p of input.programmed) {
    byExercise.set(p.exercise, p);
  }

  const out: SuggestNextWorkoutResponse["exercises"] = [];
  for (const s of input.structure.exercises) {
    const p = byExercise.get(s.exercise) ?? null;
    if (!p) {
      warnings.push(`Missing programming for: ${s.exercise}`);
    }
    const baseSets = p ? Math.max(1, Math.min(12, Math.round(p.sets))) : 3;
    const deloadMult = input.runtime.recovery.deloadRecommended
      ? input.runtime.recovery.rules.deloadVolumeMultiplier
      : 1;
    const lm = input.loadManagement;
    const lmActive = Boolean(lm && lm.weeklyLoadStatus !== "normal");
    const lmVolMult = lmActive ? lm!.volumeMultiplier : 1;
    const lmIntMult = lmActive ? lm!.intensityMultiplier : 1;
    // Use the most conservative multiplier without double-applying (e.g. recovery deload + load deload).
    const setsMult = Math.min(deloadMult, lmVolMult);
    const minSets = baseSets === 1 ? 1 : 2;
    const setsCount = Math.max(minSets, Math.min(12, Math.round(baseSets * setsMult)));
    const repsParsed = p ? parseFirstInt(p.reps) : null;
    const loadParsed = p ? parseLoadReps(p.load) : undefined;

    const defaults = buildDefaultWorkingSetsForExercise(s.exercise, input.payload);
    const baseWeight = loadParsed?.load ?? defaults[0]?.weight ?? 20;
    const baseReps = loadParsed?.reps ?? repsParsed ?? defaults[0]?.reps ?? 10;
    const finalWeight =
      lmIntMult !== 1
        ? Math.round(Math.max(0, Number(baseWeight) || 0) * lmIntMult * 2) / 2
        : Math.max(0, Number(baseWeight) || 0);

    const sets = Array.from({ length: setsCount }, () => ({
      weight: finalWeight,
      reps: Math.max(0, Math.round(Number(baseReps) || 0)),
    }));

    const fatigueNote =
      input.runtime.recovery.deloadRecommended
        ? input.payload.language === "ru"
          ? "Режим восстановления: меньше объёма."
          : "Recovery/deload: reduced volume."
        : input.runtime.recovery.globalFatigueLevel === "high"
          ? input.payload.language === "ru"
            ? "Высокая усталость: без форсирования."
            : "High fatigue: avoid pushing intensity."
          : "";

    const progNote =
      p && p.progression
        ? `${p.progression}${p.restSeconds >= 0 ? `; rest ${p.restSeconds}s` : ""}${fatigueNote ? `; ${fatigueNote}` : ""}`
        : input.payload.language === "ru"
          ? "Программирование по каркасу; настрой нагрузку по журналу."
          : "Skeleton programming; match load to your log.";

    const lmNote = !lmActive
      ? ""
      : lm!.weeklyLoadStatus === "deload"
        ? "load_management_deload"
        : lm!.weeklyLoadStatus === "high"
          ? "load_management_high_fatigue"
          : "load_management_elevated";

    out.push({
      name: s.exercise,
      sets,
      decision: "maintain",
      decision_label: DEFAULT_DECISION_LABEL.maintain,
      reason: cap(lmNote ? `${progNote}; ${lmNote}` : progNote, MAX_EXERCISE_REASON),
    });
  }

  // Detect extras in programmed list (should not happen; prompt forbids).
  for (const p of input.programmed) {
    if (!input.structure.exercises.some((x) => x.exercise === p.exercise)) {
      warnings.push(`Unexpected programmed exercise (not in selectedStructure): ${p.exercise}`);
    }
  }

  return { exercises: out, warnings };
}

function padExercisesToSkeleton(
  exercises: SuggestNextWorkoutResponse["exercises"],
  split: "push" | "pull" | "legs" | "full" | "unknown",
  input: AiCoachRequestPayload,
): SuggestNextWorkoutResponse["exercises"] {
  const sk = toSkeletonSplit(split);
  if (!sk) return exercises;
  const slots = getWorkoutSkeleton(sk);
  if (exercises.length >= Math.max(5, slots.length)) return exercises;

  const used = new Set(exercises.map((e) => e.name));
  const out = [...exercises];
  for (const slot of slots) {
    if (out.length >= slots.length) break;
    const name = pickExerciseForSlot(slot, used);
    if (used.has(name)) continue;
    used.add(name);
    out.push({
      name,
      sets: buildDefaultWorkingSetsForExercise(name, input),
      decision: "maintain",
      decision_label: input.language === "ru" ? "Стабильная нагрузка" : "Maintain",
      reason:
        input.language === "ru"
          ? "Добавлено для структуры тренировки."
          : "Added to complete the workout structure.",
    });
  }
  return out;
}

function localDecisionLabel(
  lang: AiCoachRequestPayload["language"],
  kind: "inc_reps" | "inc_sets" | "inc_weight" | "reduce_sets" | "maintain",
): string {
  const ru = lang === "ru";
  switch (kind) {
    case "inc_reps":
      return ru ? "+1 повторение" : "+1 rep";
    case "inc_sets":
      return ru ? "+1 подход" : "+1 set";
    case "inc_weight":
      return ru ? "+ вес" : "+ weight";
    case "reduce_sets":
      return ru ? "−1 подход" : "−1 set";
    case "maintain":
    default:
      return ru ? "Стабильная нагрузка" : "Maintain";
  }
}

function applyFatigueBasedProgression(
  exercises: SuggestNextWorkoutResponse["exercises"],
  fatigue: FatigueSignal,
  lang: AiCoachRequestPayload["language"],
  strategyText: string,
  musclesAtWeeklyVolumeMax: string[],
): SuggestNextWorkoutResponse["exercises"] {
  const n = exercises.length;
  if (n === 0) return exercises;

  const strat = (strategyText ?? "").toLowerCase();
  const strategyWantsProgress = /progress|прогресс|overload/.test(strat);
  const shouldProgress = (fatigue === "low" || fatigue === "moderate") && strategyWantsProgress;
  if (!shouldProgress) {
    // High fatigue: bias to maintain.
    return exercises.map((ex) => ({
      ...ex,
      decision: ex.decision === "reduce" ? "reduce" : "maintain",
      decision_label:
        ex.decision === "reduce" ? ex.decision_label : localDecisionLabel(lang, "maintain"),
    }));
  }

  // Guarantee meaningful progression in "progress" strategy sessions.
  // If the model is too passive (<30% progressed), we upgrade some maintain exercises to progression,
  // aiming for ~35% (30–40% band).
  const minRatioTrigger = 0.3;
  const target = Math.max(1, Math.ceil(n * 0.35));
  const progressed0 = exercises.filter((e) => e.decision !== "maintain").length;
  if (progressed0 >= target) return exercises;
  if (progressed0 / n >= minRatioTrigger) return exercises;

  const next = exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }));
  let progressed = progressed0;

  const blocked = new Set((musclesAtWeeklyVolumeMax ?? []).map((s) => String(s).toLowerCase()));

  function priorityScore(name: string): number {
    const s = name.toLowerCase();
    const isolation =
      /curl|pushdown|extension|fly|raise|lateral|rear delt|calf|crunch|plank|leg raise|pallof/.test(
        s,
      );
    const cable = /cable|pulley/.test(s);
    const machine = /machine|smith/.test(s);
    // Higher is better.
    return (isolation ? 300 : 0) + (cable ? 200 : 0) + (machine ? 100 : 0);
  }

  const idxs = next
    .map((ex, i) => ({ i, score: priorityScore(ex.name) }))
    .sort((a, b) => b.score - a.score);

  for (const { i } of idxs) {
    if (progressed >= target) break;
    const ex = next[i]!;
    if (ex.decision !== "maintain") continue;
    if (!ex.sets.length) continue;

    // Do not add stress for muscles already at weekly volume max.
    const b = muscleBucket(ex.name);
    const blockedByVolume =
      blocked.has(b) ||
      (b === "arms" && (blocked.has("biceps") || blocked.has("triceps"))) ||
      (b === "legs" && blocked.has("hamstrings"));
    if (blockedByVolume) continue;

    if (fatigue === "moderate") {
      // Moderate fatigue: reps-only progression.
      for (const s of ex.sets) s.reps = Math.max(0, Math.round(s.reps) + 1);
      ex.decision = "increase";
      ex.decision_label = localDecisionLabel(lang, "inc_reps");
      progressed += 1;
      continue;
    }

    // Low fatigue: reps-first progression. (Keep it conservative; no auto-weight jumps here.)
    for (const s of ex.sets) s.reps = Math.max(0, Math.round(s.reps) + 1);
    ex.decision = "increase";
    ex.decision_label = localDecisionLabel(lang, "inc_reps");
    progressed += 1;
  }

  return next;
}

function finalizeResponse(
  parsed: ParsedModel,
  input: AiCoachRequestPayload,
  structure: ReturnType<typeof selectWorkoutStructure>,
  runtime: EngineRuntimeContext,
  loadManagement?: LoadManagementState,
): SuggestNextWorkoutResponse {
  const training_signals0 = buildTrainingSignalsFromModelOrPayload(parsed, input);
  const training_signals: AiTrainingSignalsResponse = {
    ...training_signals0,
    // Deterministic structure decides the split; keep model split text from drifting.
    split: structure.split,
    fatigue:
      runtime.recovery.deloadRecommended || runtime.recovery.globalFatigueLevel === "high"
        ? "high"
        : training_signals0.fatigue,
  };

  const merged = buildExercisesFromStructureAndProgramming({
    payload: input,
    structure,
    programmed: parsed.programmedExercises,
    runtime,
    loadManagement,
  });

  const splitLabel = normalizeSplitLabel(structure.split);
  const exercisesSplitFiltered = filterExercisesBySplit(merged.exercises, splitLabel);
  const skel = toSkeletonSplit(splitLabel);
  const structureFix = skel
    ? repairWorkoutBySkeleton({
        exercises: exercisesSplitFiltered,
        split: skel,
        language: input.language,
        buildDefaultSets: (name) => buildDefaultWorkingSetsForExercise(name, input),
      })
    : dedupeExercisesGeneric(
        exercisesSplitFiltered,
        input.language,
        (name) => buildDefaultWorkingSetsForExercise(name, input),
      );
  const autoFixWarnings = structureFix.warning ? [structureFix.warning] : [];
  const exercisesPadded = padExercisesToSkeleton(structureFix.exercises, splitLabel, input);
  const exercises = applyFatigueBasedProgression(
    exercisesPadded,
    training_signals.fatigue,
    input.language,
    training_signals.strategy,
    input.aiDecisionContext?.laggingMuscles?.laggingInterventionBlockers?.musclesAtWeeklyVolumeMax ??
      [],
  );
  // Insights are attached after finalize via generateWorkoutInsights (LLM + fallback).
  const insights: SuggestNextWorkoutResponse["insights"] = [];
  const confServer = computeConfidenceScore(input, exercises);
  const confidence = mergeConfidence(parsed.confidence, confServer);
  const warnings = (() => {
    const w = [...autoFixWarnings, ...merged.warnings, ...parsed.warnings];
    if (input.language !== "ru") return w;
    return w.map((s) => {
      const t = String(s ?? "").trim();
      if (!t) return t;
      if (t.startsWith("Missing programming for:")) {
        return t.replace("Missing programming for:", "Не хватает программирования для:");
      }
      if (t.startsWith("Unexpected programmed exercise")) {
        return t.replace(
          "Unexpected programmed exercise (not in selectedStructure):",
          "Лишнее упражнение в программировании (нет в выбранной структуре):",
        );
      }
      // Fallback: keep original string if we don't have a safe translation yet.
      return t;
    });
  })();
  const RECOVERY_MAIN = [
    "chest",
    "back",
    "shoulders",
    "legs",
    "biceps",
    "triceps",
    "core",
  ] as const;
  const recoverySummary: SuggestNextWorkoutResponse["recoverySummary"] = RECOVERY_MAIN.map((muscle) => {
    const row = runtime.recovery.muscles[muscle];
    const status =
      row?.status === "ready"
        ? ("ready" as const)
        : row?.status === "moderate"
          ? ("recovering" as const)
          : row?.status === "fatigued"
            ? ("fatigued" as const)
            : ("unknown" as const);
    const score =
      typeof row?.recoveryScore === "number" && Number.isFinite(row.recoveryScore)
        ? row.recoveryScore
        : undefined;
    return { muscle, status, score };
  });
  const volumeSummary: SuggestNextWorkoutResponse["volumeSummary"] = RECOVERY_MAIN.map((muscle) => {
    const planRow = runtime.decision.volumePlan?.muscleVolume?.find(
      (r) => String(r.muscleGroup).toLowerCase() === muscle,
    );
    const weekly =
      runtime.decision.muscleVolume?.weeklyMuscleVolume?.[muscle] ??
      (typeof planRow?.weeklySets === "number" ? planRow.weeklySets : undefined);
    const sets =
      typeof weekly === "number" && Number.isFinite(weekly) ? Math.max(0, Math.round(weekly)) : undefined;
    const statusFromPlan =
      planRow?.status === "low" || planRow?.status === "optimal" || planRow?.status === "high"
        ? planRow.status
        : null;
    const status =
      statusFromPlan ??
      (sets === undefined
        ? ("unknown" as const)
        : sets <= 8
          ? ("low" as const)
          : sets <= 16
            ? ("optimal" as const)
            : ("high" as const));
    return { muscle, status, sets };
  });
  return {
    title: parsed.title,
    session_type: parsed.session_type,
    reason: cap(parsed.reason, MAX_LINE),
    confidence,
    training_signals,
    insights,
    exercises,
    warnings,
    recoverySummary,
    volumeSummary,
  };
}

export function getFallbackNextWorkoutSuggestion(): SuggestNextWorkoutResponse {
  const full = QUICK_WORKOUT_TEMPLATES.find((t) => t.id === "full");
  const names = full
    ? [...full.exercises].slice(0, 5)
    : [
        "Squat",
        "Barbell Bench Press",
        "Pull-ups",
        "Romanian Deadlift",
        "Dumbbell Shoulder Press",
      ];
  const exercises: SuggestNextWorkoutResponse["exercises"] = names.map((name) => ({
    name,
    sets: [
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
    ],
    decision: "maintain",
    decision_label: DEFAULT_DECISION_LABEL.maintain,
    reason: cap("Default from the in-app full-body template.", MAX_EXERCISE_REASON),
  }));

  return {
    title: "Full body (default)",
    session_type: "Normal progression",
    confidence: 24,
    reason: cap(
      "Add OPENAI_API_KEY to your environment for a personalized next session. This is a balanced template; adjust loads before training.",
      MAX_LINE,
    ),
    training_signals: {
      split: "Full",
      fatigue: "unknown",
      volume_trend: "unknown",
      strategy: "Template fallback",
    },
    insights: [],
    exercises,
    warnings: [
      "This is a non-AI fallback. Set loads to match your level before training.",
    ],
  };
}

function normalizeSuggestPayload(
  body: AiCoachRequestPayload,
): AiCoachRequestPayload {
  const aiMode: AiCoachRequestPayload["aiMode"] =
    body.aiMode === "coach_recommended" ? "coach_recommended" : "history_based";
  return {
    ...body,
    aiMode,
    language: parseAppLanguage(body.language),
    exerciseProgression: Array.isArray(body.exerciseProgression)
      ? (body.exerciseProgression
          .filter(
            (x) => x != null && typeof x === "object",
          )
          .map((ex) => {
            if (
              "stimulusScore" in ex &&
              typeof (ex as { stimulusScore: unknown }).stimulusScore ===
                "number" &&
              Number.isFinite((ex as { stimulusScore: number }).stimulusScore)
            ) {
              return ex as ExerciseProgressionForAi;
            }
            return { ...DEFAULT_STIMULUS, ...ex } as ExerciseProgressionForAi;
          }))
      : [],
    weeklyMuscleVolume: {
      ...EMPTY_MUSCLE_VOLUME_BLOCK.weeklyMuscleVolume,
      ...(body.weeklyMuscleVolume && typeof body.weeklyMuscleVolume === "object"
        ? body.weeklyMuscleVolume
        : {}),
    },
    muscleVolumeTrend: {
      ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleVolumeTrend,
      ...(body.muscleVolumeTrend && typeof body.muscleVolumeTrend === "object"
        ? body.muscleVolumeTrend
        : {}),
    },
    muscleVolumeHistory: Array.isArray(body.muscleVolumeHistory)
      ? body.muscleVolumeHistory
      : [],
    muscleHypertrophyRanges: {
      ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleHypertrophyRanges,
      ...(body.muscleHypertrophyRanges &&
      typeof body.muscleHypertrophyRanges === "object"
        ? body.muscleHypertrophyRanges
        : {}),
    },
    muscleProgressScore: {
      ...EMPTY_LAGGING_MUSCLE_BLOCK.muscleProgressScore,
      ...(body.muscleProgressScore &&
      typeof body.muscleProgressScore === "object"
        ? body.muscleProgressScore
        : {}),
    },
    laggingMuscleGroups: Array.isArray(body.laggingMuscleGroups)
      ? body.laggingMuscleGroups
      : [],
    stagnatingExercises: Array.isArray(body.stagnatingExercises)
      ? body.stagnatingExercises
      : [],
    laggingInterventionBlockers: (() => {
      const b = body.laggingInterventionBlockers;
      if (b && typeof b === "object" && "highFatigue" in b) {
        return {
          highFatigue: Boolean(
            (b as { highFatigue?: boolean }).highFatigue,
          ),
          musclesAtWeeklyVolumeMax: Array.isArray(
            (b as { musclesAtWeeklyVolumeMax?: unknown })
              .musclesAtWeeklyVolumeMax,
          )
            ? ((b as { musclesAtWeeklyVolumeMax: PrimaryMuscleGroup[] })
                .musclesAtWeeklyVolumeMax)
            : [],
        };
      }
      return { ...EMPTY_LAGGING_MUSCLE_BLOCK.laggingInterventionBlockers };
    })(),
    muscleProgressHistory: Array.isArray(body.muscleProgressHistory)
      ? body.muscleProgressHistory
      : [],
    periodization: (() => {
      const p = body.periodization;
      if (p && typeof p === "object") {
        const c = p as Record<string, unknown>;
        return {
          ...EMPTY_PERIODIZATION,
          trainingCycleWeek: [1, 2, 3, 4].includes(
            c.trainingCycleWeek as number,
          )
            ? (c.trainingCycleWeek as 1 | 2 | 3 | 4)
            : EMPTY_PERIODIZATION.trainingCycleWeek,
          workoutIndexInCycle:
            typeof c.workoutIndexInCycle === "number" && Number.isFinite(c.workoutIndexInCycle)
              ? Math.max(
                  0,
                  Math.min(15, Math.floor(c.workoutIndexInCycle)),
                )
              : EMPTY_PERIODIZATION.workoutIndexInCycle,
          workoutPositionInTrainingWeek: [0, 1, 2, 3].includes(
            c.workoutPositionInTrainingWeek as number,
          )
            ? (c.workoutPositionInTrainingWeek as 0 | 1 | 2 | 3)
            : EMPTY_PERIODIZATION.workoutPositionInTrainingWeek,
          totalSessionsLogged:
            typeof c.totalSessionsLogged === "number" && Number.isFinite(c.totalSessionsLogged)
              ? Math.max(0, c.totalSessionsLogged)
              : EMPTY_PERIODIZATION.totalSessionsLogged,
          scheduledPhase:
            c.scheduledPhase === "moderate" ||
            c.scheduledPhase === "progression" ||
            c.scheduledPhase === "peak" ||
            c.scheduledPhase === "deload"
              ? c.scheduledPhase
              : EMPTY_PERIODIZATION.scheduledPhase,
          effectivePhase:
            c.effectivePhase === "moderate" ||
            c.effectivePhase === "progression" ||
            c.effectivePhase === "peak" ||
            c.effectivePhase === "deload"
              ? c.effectivePhase
              : EMPTY_PERIODIZATION.effectivePhase,
          forcedDeload:
            typeof c.forcedDeload === "boolean"
              ? c.forcedDeload
              : EMPTY_PERIODIZATION.forcedDeload,
          deloadSetVolumeMultiplierTarget:
            typeof c.deloadSetVolumeMultiplierTarget === "number" &&
            Number.isFinite(c.deloadSetVolumeMultiplierTarget)
              ? c.deloadSetVolumeMultiplierTarget
              : EMPTY_PERIODIZATION.deloadSetVolumeMultiplierTarget,
          cycleTypePreference:
            c.cycleTypePreference === "strength" ||
            c.cycleTypePreference === "hypertrophy" ||
            c.cycleTypePreference === "mixed"
              ? c.cycleTypePreference
              : EMPTY_PERIODIZATION.cycleTypePreference,
        };
      }
      return { ...EMPTY_PERIODIZATION };
    })(),
    aiDecisionContext:
      body.aiDecisionContext && typeof body.aiDecisionContext === "object"
        ? (body.aiDecisionContext as AiCoachRequestPayload["aiDecisionContext"])
        : {
            recentWorkouts: [],
            exerciseHistory: [],
            fatigueSignals: body.trainingSignals ?? {
              recentSplitPattern: [],
              lastWorkedMuscleGroups: [],
              volumeTrend: "unknown",
              fatigueSignal: "unknown",
              exerciseBaselines: [],
            },
            splitContinuityGuard: {
              lastWorkoutSplit: "Unknown",
              hoursSinceLastWorkout: null,
              allowSameSplit: true,
              guardActive: false,
              preferredNextSplits: ["Push", "Pull", "Legs", "Full"],
              reasons: [],
              specializationModeEnabled: false,
            },
            muscleVolume: {
              weeklyMuscleVolume: { ...EMPTY_MUSCLE_VOLUME_BLOCK.weeklyMuscleVolume },
              muscleVolumeTrend: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleVolumeTrend },
              muscleHypertrophyRanges: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleHypertrophyRanges },
            },
            laggingMuscles: { ...EMPTY_LAGGING_MUSCLE_BLOCK },
            progressionRecommendations: { exerciseProgression: body.exerciseProgression ?? [] },
            periodizationState: { ...EMPTY_PERIODIZATION },
            stimulusScores: [],
            athleteProfile: body.athleteProfile ?? {},
            aiMode,
            trainingSignals: {
              exerciseTrends: [],
              muscleRecovery: [],
              fatigueTrend: {
                level: body.trainingSignals?.fatigueSignal ?? "unknown",
                reasons: [],
              },
              progressionFocus: "maintain",
              alerts: [],
            },
            progressionPlan: { globalStrategy: "maintain", exercisePlans: [] },
            trainingPhase: {
              phase: "unknown",
              weekInPhase: 1,
              reason: "",
              fatigueIndicator: body.trainingSignals?.fatigueSignal ?? "unknown",
              volumeIndicator: "moderate",
            },
            volumePlan: { muscleVolume: [] },
          },
  };
}

/** Attach LLM + fallback insight cards to a finalized suggest-next result (uses final exercises). */
export async function enrichSuggestNextWorkoutInsights(
  result: SuggestNextWorkoutResponse,
  input: AiCoachRequestPayload,
  apiKey: string | null,
): Promise<SuggestNextWorkoutResponse> {
  const key = apiKey?.trim() ?? "";
  const { insights, source, warnings } = await generateWorkoutInsights({
    workoutResult: result,
    aiDecisionContext: input.aiDecisionContext,
    language: input.language,
    openaiClient: key ? createWorkoutInsightsOpenAIClient(key) : null,
  });
  return withSuggestNextDevDebug({ ...result, insights }, input, { source, warnings });
}

function responseViolatesSplitGuard(
  r: SuggestNextWorkoutResponse,
  input: AiCoachRequestPayload,
): boolean {
  const g = input.aiDecisionContext?.splitContinuityGuard;
  if (!g) return false;
  const label = inferWorkoutSplitFromTitleAndExercises({
    title: r.title,
    exercises: r.exercises,
  });
  return splitRepetitionViolatesGuard(g, label);
}

function buildSplitGuardFallbackSuggestion(
  input: AiCoachRequestPayload,
): SuggestNextWorkoutResponse {
  const g = input.aiDecisionContext?.splitContinuityGuard;
  const preferred = g?.preferredNextSplits?.[0] ?? "Push";
  const id =
    preferred === "Push"
      ? "push"
      : preferred === "Pull"
        ? "pull"
        : preferred === "Legs"
          ? "legs"
          : "full";
  const t =
    QUICK_WORKOUT_TEMPLATES.find((x) => x.id === id) ??
    QUICK_WORKOUT_TEMPLATES.find((q) => q.id === "push")!;
  const last = g?.lastWorkoutSplit ?? "Unknown";
  const exercises: SuggestNextWorkoutResponse["exercises"] = [...t.exercises].map((name) => ({
    name,
    sets: [
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
    ],
    decision: "maintain",
    decision_label: DEFAULT_DECISION_LABEL.maintain,
    reason: cap(
      "Picked to satisfy split continuity. Match loads to your log and equipment.",
      MAX_EXERCISE_REASON,
    ),
  }));

  return {
    title: `${t.label} (split guard)`,
    session_type: "Normal progression",
    confidence: 28,
    reason: cap(
      `Your last session was ${String(last)}. This follow-up is ${t.label} so the same pattern is not repeated within 48h.`,
      MAX_LINE,
    ),
    training_signals: {
      split: t.label,
      fatigue: input.trainingSignals?.fatigueSignal ?? "unknown",
      volume_trend: input.trainingSignals?.volumeTrend ?? "unknown",
      strategy: "Split continuity fallback",
    },
    insights: [],
    exercises,
    warnings: [
      "Split continuity guard: the model repeated your last training split, so a template from your preferred alternatives was used. Adjust weights before training.",
    ],
  };
}

function parseAndFinalize(
  content: string,
  input: AiCoachRequestPayload,
  structure: ReturnType<typeof selectWorkoutStructure>,
  runtime: EngineRuntimeContext,
  loadManagement?: LoadManagementState,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    console.error("[ai-coach] JSON parse failed");
    return null;
  }
  const loose = parseModelLoose(parsed);
  if (!loose) return null;
  return finalizeResponse(loose, input, structure, runtime, loadManagement);
}

function coachTemplateSuggestion(input: AiCoachRequestPayload): SuggestNextWorkoutResponse {
  const lang = input.language ?? "en";
  const ru = lang === "ru";
  const preferred =
    input.aiDecisionContext?.splitContinuityGuard?.preferredNextSplits?.[0] ?? "Push";
  const split = preferred === "Pull" || preferred === "Legs" ? preferred : "Push";
  const used = new Set<string>();
  const names = getWorkoutSkeleton(split).map((slot) => {
    const name = pickExerciseForSlot(slot, used);
    used.add(name);
    return name;
  });
  const baselines = new Map(
    (input.trainingSignals?.exerciseBaselines ?? []).map((b) => [normalizeExerciseName(b.name), b]),
  );
  const fatigue = input.trainingSignals?.fatigueSignal ?? "unknown";
  const targetSetCount = fatigue === "high" ? 2 : 3;

  const exercises: SuggestNextWorkoutResponse["exercises"] = names.map((name, idx) => {
    const base = baselines.get(normalizeExerciseName(name));
    const last = base?.latestSets?.[0];
    const w = last ? Math.max(0, Number(last.weight) || 0) : 20;
    const r = last ? Math.max(0, Math.round(Number(last.reps) || 0)) : 10;
    const sets = Array.from({ length: targetSetCount }, () => ({ weight: w, reps: r }));

    // Simple template progression: first 2 exercises +1 rep.
    const shouldInc = idx < 2;
    const finalSets = shouldInc ? sets.map((s) => ({ ...s, reps: s.reps + 1 })) : sets;
    return {
      name,
      sets: finalSets,
      decision: shouldInc ? "increase" : "maintain",
      decision_label: shouldInc ? (ru ? "+1 повторение" : "+1 rep") : (ru ? "Стабильная нагрузка" : "Maintain"),
      reason: ru ? "Шаблонная тренировка: простая прогрессия по повторениям." : "Template session: simple rep progression.",
    };
  });

  const out: SuggestNextWorkoutResponse = {
    title: split,
    session_type: "Normal progression",
    confidence: 62,
    reason: ru
      ? "Тренировка по каркасу: стабильная структура и простая прогрессия в ключевых упражнениях."
      : "Coach skeleton session: stable structure with simple progression on key lifts.",
    training_signals: {
      split,
      fatigue,
      volume_trend: "unknown",
      strategy: ru ? "Каркас + базовая прогрессия" : "Skeleton + basic progression",
    },
    insights: [],
    exercises,
    warnings: [],
  };
  return out;
}

function attachDecisionTraceDev(
  result: SuggestNextWorkoutResponse,
  runtime: EngineRuntimeContext,
): SuggestNextWorkoutResponse {
  if (process.env.NODE_ENV === "production") return result;
  if (!result.aiDebug) return result;
  return {
    ...result,
    aiDebug: {
      ...result.aiDebug,
      decisionTrace: {
        traceId: runtime.trace.traceId,
        entries: runtime.trace.entries,
      },
    },
  };
}

export async function fetchSuggestNextWorkoutFromOpenAI(
  input: AiCoachRequestPayload,
  apiKey: string,
): Promise<SuggestNextWorkoutResponse | null> {
  if (input.aiMode === "coach_recommended") {
    // Coach mode is template-driven: main workout is local; insights use the insight pass.
    return enrichSuggestNextWorkoutInsights(coachTemplateSuggestion(input), input, apiKey);
  }
  const payload = normalizeSuggestPayload(input);
  const runtime = await buildEngineRuntimeContextWithMemory(payload.aiDecisionContext);
  const adaptation = evaluateTrainingAdaptation(runtime);
  addTrace(runtime, {
    engine: "TrainingAdaptationEngine",
    entity: "training_adaptation",
    decision: "evaluated",
    reasons: [
      adaptation.fatigueAccumulation ? "fatigueAccumulation" : "fatigueAccumulation:false",
      `stagnatingExercises:${adaptation.stagnatingExercises.length}`,
      `recommendedAdjustments:${adaptation.recommendedAdjustments.length}`,
    ],
  });
  const loadManagement = evaluateLoadManagement(runtime, adaptation);
  addTrace(runtime, {
    engine: "LoadManagementEngine",
    entity: "load_management",
    decision: "evaluated",
    reasons: [
      `weeklyLoadStatus:${loadManagement.weeklyLoadStatus}`,
      `recommendedAction:${loadManagement.recommendedAction}`,
      `volumeMultiplier:${loadManagement.volumeMultiplier}`,
      `intensityMultiplier:${loadManagement.intensityMultiplier}`,
    ],
  });
  // Build an exercise catalog for deterministic selection.
  // Include: favorites, recent workout exercise names, and metadata starter list (for role coverage).
  // Dedupe by normalized exercise name.
  const rawCatalog = [
    ...(payload.favorites ?? []).map((f) => ({
      id: "",
      name: f.name,
      muscleGroup: f.muscleGroup,
      equipment: f.equipment,
      isFavorite: true,
      createdAt: "",
      updatedAt: "",
    })),
    ...((payload.aiDecisionContext?.recentWorkouts ?? [])
      .flatMap((w) => w.exercises.map((e) => e.name))
      .map((name) => ({
        id: "",
        name,
        muscleGroup: undefined,
        equipment: undefined,
        createdAt: "",
        updatedAt: "",
      }))),
    ...EXERCISE_METADATA_V1.map((m) => ({
      id: "",
      name: m.name,
      muscleGroup: m.primaryMuscleGroup,
      equipment: m.equipmentTags[0],
      createdAt: "",
      updatedAt: "",
    })),
  ];
  const catalog = (() => {
    const seen = new Set<string>();
    const out: typeof rawCatalog = [];
    for (const ex of rawCatalog) {
      const k = normalizeExerciseName(ex.name);
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(ex);
    }
    return out;
  })();
  const structure = selectWorkoutStructure({
    runtime,
    catalog,
    constraints: {},
  });
  const promptPayload = { ...payload, selectedStructure: structure };
  const modeBlock =
    payload.aiMode === "coach_recommended"
      ? MODE_COACH_RECOMMENDED
      : MODE_HISTORY_BASED;
  const systemContent = `${systemPrompt}\n\n${modeBlock}`;
  const user = `The JSON payload includes aiMode, aiDecisionContext, trainingSignals, trainingContext, recentSessions, exerciseStats, exerciseProgression, periodization, weeklyMuscleVolume, muscleVolumeTrend, muscleVolumeHistory, muscleHypertrophyRanges, muscleProgressScore, laggingMuscleGroups, stagnatingExercises, laggingInterventionBlockers, muscleProgressHistory, quickTemplates, and more. OBEY MODE and output only the required JSON.

${JSON.stringify({
  aiDecisionContext: promptPayload.aiDecisionContext,
  selectedStructure: promptPayload.selectedStructure,
  coachMemory: runtime.coachMemory ?? { exerciseMemories: {} },
  adaptation,
  loadManagement,
})}`;

  const content1 = await openAiSuggestChat(apiKey, systemContent, user);
  if (!content1) return null;
  const result1 = parseAndFinalize(content1, payload, structure, runtime, loadManagement);
  if (!result1) return null;

  if (!responseViolatesSplitGuard(result1, payload)) {
    if (process.env.NODE_ENV === "development") {
      const g = payload.aiDecisionContext?.splitContinuityGuard;
      if (g) {
        const inferred = inferWorkoutSplitFromTitleAndExercises({
          title: result1.title,
          exercises: result1.exercises,
        });
        console.log("[ai-coach] split post-check: OK", {
          suggestedSplit: inferred,
          lastWorkoutSplit: g.lastWorkoutSplit,
          guardActive: g.guardActive,
        });
      }
    }
    const enriched = await enrichSuggestNextWorkoutInsights(result1, payload, apiKey);
    return attachDecisionTraceDev(enriched, runtime);
  }

  if (process.env.NODE_ENV === "development") {
    const g2 = payload.aiDecisionContext?.splitContinuityGuard;
    console.warn("[ai-coach] split guard: first response repeated last split", {
      last: g2?.lastWorkoutSplit,
      title: result1.title,
    });
  }

  const g = payload.aiDecisionContext?.splitContinuityGuard;
  const preferredList = g?.preferredNextSplits?.length
    ? g.preferredNextSplits.join(", ")
    : "Push, Pull, or Legs";
  const lastSplit = g?.lastWorkoutSplit ?? "the last one";
  const retryUser = `The JSON you returned is INVALID for split continuity. It repeats the same training split as the user's most recent completed session, which is NOT allowed while splitContinuityGuard.guardActive is true.

Last session split: ${String(lastSplit)}
You MUST select a different split for this prescription. Choose EXACTLY ONE of these: ${preferredList}

Return a complete NEW JSON object using the same schema. Rewrite title, exercises, training_signals.split, and the global reason so the session clearly uses one of the allowed splits and does NOT repeat ${String(lastSplit)}. Do not return the same split as the last session.`;

  const content2 = await openAiSuggestChat(apiKey, systemContent, user, {
    assistantJson: content1,
    userRetry: retryUser,
  });

  if (content2) {
    const result2 = parseAndFinalize(content2, payload, structure, runtime, loadManagement);
    if (result2 && !responseViolatesSplitGuard(result2, payload)) {
      if (process.env.NODE_ENV === "development") {
        console.log("[ai-coach] split guard: second response accepted");
      }
      const enriched = await enrichSuggestNextWorkoutInsights(result2, payload, apiKey);
      return attachDecisionTraceDev(enriched, runtime);
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[ai-coach] split guard: using template fallback (preferredNextSplits[0])",
    );
  }
  const fallback = buildSplitGuardFallbackSuggestion(payload);
  const enrichedFallback = await enrichSuggestNextWorkoutInsights(fallback, payload, apiKey);
  return attachDecisionTraceDev(enrichedFallback, runtime);
}
