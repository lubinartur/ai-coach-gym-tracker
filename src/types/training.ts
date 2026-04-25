import type { AthleteProfile } from "./athleteProfile";
export type { TrainingPhase } from "./trainingShared";
export type { AthleteProfile } from "./athleteProfile";

export type WorkoutDayType = "chest_shoulders" | "back_arms" | "legs";

export type TemplateExercise = {
  label: string;
  defaultPlannedValue?: string;
  order: number;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  dayType: WorkoutDayType;
  exercises: TemplateExercise[];
};

/** Last N completed workout logs for the AI planner */
export type TrainingSession = {
  date: string;
  exercises: {
    label: string;
    plannedValue: string;
    actualValue?: string;
  }[];
  energy?: number;
  notes?: string;
};

/** Input contract for training-aware workout planning */
export type PlannerInput = {
  athleteProfile: AthleteProfile;
  recentSessions: TrainingSession[];
  workoutTemplate: WorkoutTemplate;
};
