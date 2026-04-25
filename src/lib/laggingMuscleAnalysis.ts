import { getExerciseMuscleGroup, PRIMARY_MUSCLE_GROUPS, type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { getCalendarDateInTimezone } from "@/lib/dates";
import {
  buildCatalogLookup,
  MUSCLE_HYPERTROPHY_SETS_PER_WEEK,
  resolvePrimaryMuscle,
} from "@/lib/muscleVolumeAnalysis";
import type {
  ExerciseProgressionForAiBase,
  ExerciseProgressionTrend,
  FatigueSignal,
  LaggingInterventionBlockers,
  MuscleGroupAggregateTrend,
  StagnationExerciseForAi,
  MuscleProgressHistoryEntry,
} from "@/types/aiCoach";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";

function emptyProgressScore(): Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend> {
  const o = {} as Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend>;
  for (const m of PRIMARY_MUSCLE_GROUPS) o[m] = "unknown";
  return o;
}

function atWeeklyMax(
  m: PrimaryMuscleGroup,
  weekly: Record<PrimaryMuscleGroup, number>,
  ranges: Partial<Record<PrimaryMuscleGroup, { min: number; max: number }>>,
): boolean {
  const b = ranges[m] ?? MUSCLE_HYPERTROPHY_SETS_PER_WEEK[m];
  if (!b) return false;
  return (weekly[m] ?? 0) >= b.max;
}

function primaryMuscleForProgressionEntry(
  name: string,
  key: string,
  sessions: WorkoutSession[],
  lookup: ReturnType<typeof buildCatalogLookup>,
): PrimaryMuscleGroup {
  for (const s of sessions) {
    const ex = s.exercises.find((e) => normalizeExerciseName(e.name) === key);
    if (ex) return resolvePrimaryMuscle(ex, lookup);
  }
  return getExerciseMuscleGroup(name);
}

function lastTopSet(
  ex: Pick<ExerciseProgressionForAiBase, "history">,
): { w: number; r: number } {
  const h = ex.history;
  if (h.length < 1) return { w: 0, r: 0 };
  const l = h[h.length - 1]!;
  return { w: l.topWeight, r: l.topReps };
}

/**
 * Reduces a list of exercise-level trends to one per-muscle label.
 */
function reduceMuscleTrend(
  list: ExerciseProgressionTrend[],
): MuscleGroupAggregateTrend {
  if (list.length === 0) return "unknown";
  const s = new Set(list);
  if (s.size === 1) {
    const t = list[0]!;
    if (t === "unknown") return "unknown";
    if (t === "improving") return "improving";
    if (t === "stable") return "stable";
    if (t === "stagnating") return "stagnating";
    if (t === "declining") return "declining";
    return "unknown";
  }
  if (s.has("stagnating") && s.has("declining")) return "mixed";
  if (s.has("improving") && s.has("stagnating")) return "mixed";
  if (s.has("improving") && s.has("declining")) return "mixed";
  if (s.has("stagnating") && s.has("stable")) return "stagnating";
  if (s.has("improving") && s.has("stable") && s.size === 2) {
    return "improving";
  }
  if (s.has("declining")) return "declining";
  if (s.has("stagnating")) return "stagnating";
  if (s.has("improving")) return "improving";
  if (s.has("stable")) return "stable";
  return "unknown";
}

function pickLaggingMuscleGroups(
  byMuscle: Map<PrimaryMuscleGroup, ExerciseProgressionForAiBase["trend"][]>,
  score: Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend>,
): PrimaryMuscleGroup[] {
  const hasAnyImproving = PRIMARY_MUSCLE_GROUPS.some(
    (m) => score[m] === "improving" && (byMuscle.get(m)?.length ?? 0) > 0,
  );
  const hasAnyStagnationSignal = PRIMARY_MUSCLE_GROUPS.some(
    (m) =>
      (byMuscle.get(m) ?? []).some(
        (t) => t === "stagnating" || t === "declining",
      ),
  );
  const out: PrimaryMuscleGroup[] = [];
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    if ((byMuscle.get(m) ?? []).length === 0) continue;
    const a = score[m]!;
    if (a === "stagnating" || a === "declining") {
      out.push(m);
      continue;
    }
    if (a === "mixed" && hasAnyImproving) {
      if (
        (byMuscle.get(m) ?? []).some(
          (t) => t === "stagnating" || t === "declining",
        )
      ) {
        out.push(m);
      }
    }
  }
  if (out.length === 0 && hasAnyStagnationSignal && !hasAnyImproving) {
    for (const m of PRIMARY_MUSCLE_GROUPS) {
      if (score[m] === "stagnating" || score[m] === "declining") {
        if (!out.includes(m)) out.push(m);
      }
    }
  }
  return out;
}

function buildStagnationExercises(
  progression: ExerciseProgressionForAiBase[],
  sessions: WorkoutSession[],
  lookup: ReturnType<typeof buildCatalogLookup>,
): StagnationExerciseForAi[] {
  const out: StagnationExerciseForAi[] = [];
  for (const p of progression) {
    if (p.trend === "stagnating" && p.stagnationSessions < 3) continue;
    if (p.trend === "stagnating" || p.trend === "declining") {
      const key = normalizeExerciseName(p.name) ?? p.name;
      const muscle = primaryMuscleForProgressionEntry(
        p.name,
        key,
        sessions,
        lookup,
      );
      const { w, r } = lastTopSet(p);
      out.push({
        name: p.name,
        primaryMuscle: muscle,
        trend: p.trend,
        stagnationSessions: p.stagnationSessions,
        topWeight: w,
        topReps: r,
      });
    }
  }
  return out;
}

// Note: stimulus-based lagging is handled by the model using `stimulusScores` in `aiDecisionContext`.
// This module stays purely progression/volume/fatigue based to keep pipeline ordering deterministic.

/**
 * Stagnation uses the same 3× flat top-set rule as `progressionEngine` (injected as `exerciseProgression`).
 * Runs after `buildMuscleVolumeAnalysisForPayload`, before the model. No Dexie / schema changes.
 * `exerciseProgression` should include **stimulus** (post `enrichProgressionWithStimulus`) so low-streak signals can nudge `laggingMuscleGroups`.
 */
export function buildLaggingMuscleAnalysisForPayload(
  sessions: WorkoutSession[],
  timeZone: string,
  catalog: Exercise[],
  exerciseProgression: ExerciseProgressionForAiBase[],
  fatigueSignal: FatigueSignal,
  weeklyMuscleVolume: Record<PrimaryMuscleGroup, number>,
  muscleHypertrophyRanges: Partial<
    Record<PrimaryMuscleGroup, { min: number; max: number }>
  >,
): {
  muscleProgressScore: Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend>;
  laggingMuscleGroups: PrimaryMuscleGroup[];
  stagnatingExercises: StagnationExerciseForAi[];
  laggingInterventionBlockers: LaggingInterventionBlockers;
  muscleProgressHistory: MuscleProgressHistoryEntry[];
} {
  const lookup = buildCatalogLookup(catalog);
  const byMuscle = new Map<PrimaryMuscleGroup, ExerciseProgressionTrend[]>();

  for (const p of exerciseProgression) {
    const key = normalizeExerciseName(p.name) ?? p.name;
    const muscle = primaryMuscleForProgressionEntry(
      p.name,
      key,
      sessions,
      lookup,
    );
    const t = p.trend;
    const a = byMuscle.get(muscle);
    if (a) a.push(t);
    else byMuscle.set(muscle, [t]);
  }

  const muscleProgressScore = emptyProgressScore();
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    const list = byMuscle.get(m) ?? [];
    muscleProgressScore[m] = reduceMuscleTrend(list);
  }

  const laggingMuscleGroups = pickLaggingMuscleGroups(byMuscle, muscleProgressScore);

  const atMax: PrimaryMuscleGroup[] = [];
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    if (atWeeklyMax(m, weeklyMuscleVolume, muscleHypertrophyRanges)) {
      atMax.push(m);
    }
  }

  const asOf = getCalendarDateInTimezone(new Date(), timeZone);
  return {
    muscleProgressScore,
    laggingMuscleGroups,
    stagnatingExercises: buildStagnationExercises(
      exerciseProgression,
      sessions,
      lookup,
    ),
    laggingInterventionBlockers: {
      highFatigue: fatigueSignal === "high",
      musclesAtWeeklyVolumeMax: atMax,
    },
    muscleProgressHistory: [
      {
        asOf,
        muscleProgressScore: { ...muscleProgressScore },
        laggingMuscleGroups: [...laggingMuscleGroups],
      },
    ],
  };
}

const EMPTY_SCORE: Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend> =
  (() => {
    const o = emptyProgressScore();
    return o;
  })();

export const EMPTY_LAGGING_MUSCLE_BLOCK: ReturnType<
  typeof buildLaggingMuscleAnalysisForPayload
> = {
  muscleProgressScore: { ...EMPTY_SCORE },
  laggingMuscleGroups: [],
  stagnatingExercises: [],
  laggingInterventionBlockers: {
    highFatigue: false,
    musclesAtWeeklyVolumeMax: [],
  },
  muscleProgressHistory: [],
};
