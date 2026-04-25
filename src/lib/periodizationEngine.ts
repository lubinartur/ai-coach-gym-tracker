import type {
  FatigueSignal,
  PeriodizationForAi,
  TrainingCycleTypePreference,
} from "@/types/aiCoach";
import type { WorkoutSession } from "@/types/trainingDiary";

/** Workouts in each “training week” within a 4-week macrocycle (4 blocks of 4). */
export const TRAINING_WEEK_SIZE = 4;
/** 4 training weeks × 4 workouts = 16 sessions per full cycle. */
export const CYCLE_LENGTH_WORKOUTS = 16;
export const DELOAD_SET_MULTIPLIER_MIN = 0.6;
export const DELOAD_SET_MULTIPLIER_MAX = 0.7;
export const DELOAD_SET_MULTIPLIER_TARGET = 0.65;

function scheduledPhaseForWeek(week: 1 | 2 | 3 | 4): PeriodizationForAi["scheduledPhase"] {
  if (week === 1) return "moderate";
  if (week === 2) return "progression";
  if (week === 3) return "peak";
  return "deload";
}

/**
 * 4 training weeks, each 4 completed sessions (16 workouts per full cycle, then repeat).
 * The **next** session to run uses `totalSessionsCompleted` = `sessions.length` as the
 * 0-based index of the next workout: week = floor((n % 16) / 4) + 1.
 */
export function buildPeriodizationForPayload(
  sessions: WorkoutSession[],
  fatigueSignal: FatigueSignal,
  cycleTypePreference: TrainingCycleTypePreference = "hypertrophy",
): PeriodizationForAi {
  const totalSessionsLogged = sessions.length;
  const workoutIndexInCycle = totalSessionsLogged % CYCLE_LENGTH_WORKOUTS;
  const weekNum = (Math.floor(workoutIndexInCycle / TRAINING_WEEK_SIZE) + 1) as
    | 1
    | 2
    | 3
    | 4;
  const workoutPositionInTrainingWeek = (workoutIndexInCycle %
    TRAINING_WEEK_SIZE) as 0 | 1 | 2 | 3;

  const scheduledPhase = scheduledPhaseForWeek(weekNum);
  const forcedDeload = fatigueSignal === "high";
  const effectivePhase: PeriodizationForAi["effectivePhase"] = forcedDeload
    ? "deload"
    : scheduledPhase;

  const inDeload = effectivePhase === "deload";

  return {
    trainingCycleWeek: weekNum,
    workoutIndexInCycle,
    workoutPositionInTrainingWeek,
    totalSessionsLogged,
    scheduledPhase,
    effectivePhase,
    forcedDeload,
    deloadSetVolumeMultiplierTarget: inDeload
      ? DELOAD_SET_MULTIPLIER_TARGET
      : 1,
    cycleTypePreference,
  };
}

export const EMPTY_PERIODIZATION: PeriodizationForAi = {
  trainingCycleWeek: 1,
  workoutIndexInCycle: 0,
  workoutPositionInTrainingWeek: 0,
  totalSessionsLogged: 0,
  scheduledPhase: "moderate",
  effectivePhase: "moderate",
  forcedDeload: false,
  deloadSetVolumeMultiplierTarget: 1,
  cycleTypePreference: "hypertrophy",
};
