/**
 * One-shot handoff from Progress → Workout (home) when the user starts an AI
 * suggested session. Consumed in WorkoutView on mount, then removed.
 */
export const AI_WORKOUT_DRAFT_KEY = "leapAiWorkoutDraftV1";

export type AiWorkoutDraftPayload = {
  title: string;
  exercises: { name: string; sets: { weight: number; reps: number }[] }[];
};
