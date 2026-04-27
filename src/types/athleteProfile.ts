import type { TrainingPhase } from "./trainingShared";

/** Primary training aim (gym / AI coach). */
export type AthleteTrainingGoal =
  | "build_muscle"
  | "lose_fat"
  | "recomposition"
  | "strength"
  | "general_fitness";

export type AthleteExperience = "beginner" | "intermediate" | "advanced";

export type AthleteEquipment = "commercial_gym" | "home_gym" | "bodyweight";

export type StrengthCalibrationEntry = { weight: number; reps: number };

export type StrengthCalibration = {
  benchPress?: StrengthCalibrationEntry;
  squatOrLegPress?: StrengthCalibrationEntry;
  deadliftOrRdl?: StrengthCalibrationEntry;
  latPulldownOrPullup?: StrengthCalibrationEntry;
  shoulderPress?: StrengthCalibrationEntry;
};

/**
 * Affects AI Coach set-count recommendations only (not medical advice).
 * `high` = can tolerate a bit more training volume when other signals allow.
 */
export type AthleteRecoveryCapacity = "normal" | "high";

/**
 * Single stored athlete record (Dexie). Merges gym onboarding with optional
 * legacy planning fields (phase) used by the daily plan generator.
 */
export type AthleteProfile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** False until user finishes onboarding or taps Skip. */
  onboardingCompleted?: boolean;

  sex?: "male" | "female" | "other";
  age?: number;
  heightCm?: number;
  weightKg?: number;
  goal?: AthleteTrainingGoal;
  experience?: AthleteExperience;
  /** Default `normal`. Used for AI volume suggestions only. */
  recoveryCapacity?: AthleteRecoveryCapacity;
  /** 2–5 (5 = 5+ days / week) */
  trainingDaysPerWeek?: number;
  equipment?: AthleteEquipment;
  /** e.g. lower_back, shoulders, knees, elbows; omit or empty if none */
  limitations?: string[];
  /** Free text for AI; also used for legacy migration strings */
  notes?: string;

  /**
   * Optional: user-provided known working weights to seed first workouts
   * when no log-based baselines exist yet.
   */
  strengthCalibration?: StrengthCalibration;

  /** Daily plan / legacy: PCT, etc. */
  phase?: TrainingPhase;
  offCycleDate?: string;
};
