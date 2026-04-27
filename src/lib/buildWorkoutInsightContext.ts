import { type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { AiDecisionContext } from "@/types/aiCoach";
import type { SuggestNextWorkoutResponse } from "@/types/aiCoach";
import type { Exercise } from "@/types/trainingDiary";
import {
  buildCatalogLookup,
  resolveCatalogRowByExerciseName,
} from "@/services/exerciseCatalogResolve";

export type WorkoutInsightDecisionType =
  | "increase_reps"
  | "increase_sets"
  | "increase_weight"
  | "reduce"
  | "maintain"
  | "technique"
  | "volume"
  | "other";

function inferDecisionType(ex: SuggestNextWorkoutResponse["exercises"][number]): WorkoutInsightDecisionType {
  const d = ex.decision;
  const l = (ex.decision_label || "").toLowerCase();
  if (d === "reduce") return "reduce";
  if (d === "technique") return "technique";
  if (d === "volume") return "volume";
  if (d === "maintain") return "maintain";
  if (d === "increase") {
    if (/\bkg\b|weight|кг|\bвес/i.test(l)) return "increase_weight";
    if (/set|подход|sets/i.test(l)) return "increase_sets";
    return "increase_reps";
  }
  return "other";
}

export type WorkoutInsightContextJson = {
  language: string;
  split: string;
  title: string;
  lastWorkout: string;
  lastWorkoutSplit: string;
  strategy: string;
  exercises: {
    name: string;
    muscleGroup: PrimaryMuscleGroup;
    sets: number;
    decisionType: WorkoutInsightDecisionType;
  }[];
  actualChanges: {
    increasedExercises: string[];
    reducedExercises: string[];
    maintainedExercises: string[];
  };
  weeklyVolume: Record<string, number>;
  muscleRecovery: {
    muscleGroup: PrimaryMuscleGroup;
    status: string;
    recoveryScore: number;
  }[];
  laggingMuscles: string[];
  fatigueLevel: string;
};

/**
 * Compact JSON for the workout insight LLM (final workout + decision context only).
 */
export function buildWorkoutInsightContext(
  workoutResult: SuggestNextWorkoutResponse,
  aiDecisionContext: AiDecisionContext | null | undefined,
  language: string | undefined,
  exerciseCatalog: Exercise[] | undefined,
): WorkoutInsightContextJson {
  const lang = language === "ru" ? "ru" : "en";
  const catalogLookup =
    exerciseCatalog && exerciseCatalog.length > 0
      ? buildCatalogLookup(exerciseCatalog)
      : null;
  const split = workoutResult.training_signals?.split?.trim() || "—";
  const last = aiDecisionContext?.recentWorkouts?.[0];
  const g = aiDecisionContext?.splitContinuityGuard;
  const lastTitle = last?.title?.trim() || "—";
  const lastSplit = g?.lastWorkoutSplit ?? "Unknown";
  const strategy = workoutResult.training_signals?.strategy?.trim() || "—";
  const fatigueLevel = workoutResult.training_signals?.fatigue ?? "unknown";

  const increasedExercises: string[] = [];
  const reducedExercises: string[] = [];
  const maintainedExercises: string[] = [];

  const exercises = workoutResult.exercises.map((ex) => {
    const row = catalogLookup
      ? resolveCatalogRowByExerciseName(ex.name, catalogLookup)
      : null;
    const muscleGroup: PrimaryMuscleGroup = row?.primaryMuscle ?? "other";
    const decisionType = inferDecisionType(ex);
    if (decisionType === "reduce") reducedExercises.push(ex.name);
    else if (
      decisionType === "increase_reps" ||
      decisionType === "increase_sets" ||
      decisionType === "increase_weight" ||
      decisionType === "volume"
    ) {
      increasedExercises.push(ex.name);
    } else {
      maintainedExercises.push(ex.name);
    }
    return {
      name: ex.name,
      muscleGroup,
      sets: ex.sets.length,
      decisionType,
    };
  });

  const weekly = aiDecisionContext?.muscleVolume?.weeklyMuscleVolume ?? {};
  const weeklyVolume: Record<string, number> = {};
  for (const [k, v] of Object.entries(weekly)) {
    if (typeof v === "number" && Number.isFinite(v)) weeklyVolume[k] = v;
  }

  const muscleRecovery = (aiDecisionContext?.trainingSignals?.muscleRecovery ?? [])
    .slice(0, 12)
    .map((m) => ({
      muscleGroup: m.muscleGroup,
      status: m.status,
      recoveryScore: m.recoveryScore,
    }));

  const laggingMuscles = [
    ...(aiDecisionContext?.laggingMuscles?.laggingMuscleGroups ?? []).map(String),
  ];

  return {
    language: lang,
    split,
    title: workoutResult.title?.trim() || "—",
    lastWorkout: lastTitle,
    lastWorkoutSplit: String(lastSplit),
    strategy,
    exercises,
    actualChanges: {
      increasedExercises: [...new Set(increasedExercises)],
      reducedExercises: [...new Set(reducedExercises)],
      maintainedExercises: [...new Set(maintainedExercises)],
    },
    weeklyVolume,
    muscleRecovery,
    laggingMuscles,
    fatigueLevel,
  };
}
