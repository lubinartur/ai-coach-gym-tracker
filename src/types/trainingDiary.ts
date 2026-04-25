import type { WorkoutAiReview } from "@/types/aiCoach";

export type Exercise = {
  id: string;
  name: string;
  muscleGroup?: string;
  equipment?: string;
  /** `library` if seeded/synced from local catalog; `custom` if user-created. Omitted = legacy. */
  source?: "library" | "custom";
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutSet = {
  id: string;
  weight: number;
  reps: number;
  volume: number;
  isDone?: boolean;
  /** ISO string when the set was marked done */
  completedAt?: string;
};

export type WorkoutExercise = {
  id: string;
  exerciseId?: string;
  name: string;
  sets: WorkoutSet[];
};

export type WorkoutSession = {
  id: string;
  date: string;
  title: string;
  durationMin?: number;
  notes?: string;
  exercises: WorkoutExercise[];
  totalVolume: number;
  totalSets: number;
  createdAt: string;
  /** When the workout was done (user-editable; used for history / AI ordering). */
  performedAt?: string;
  updatedAt: string;
  /** AI feedback from POST /api/ai-coach/review-workout, if generated. */
  aiReview?: WorkoutAiReview;
};

