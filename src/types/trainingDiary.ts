import type { WorkoutAiReview } from "@/types/aiCoach";
import type {
  ContraindicationTag,
  EquipmentTag,
  ExerciseSource,
  MovementPattern,
  PrimaryMuscleGroup,
  SkeletonSlot,
} from "@/types/exerciseCatalog";

export type Exercise = {
  id: string;
  name: string;

  // Phase 1 required (canonical catalog)
  normalizedName: string;
  primaryMuscle: PrimaryMuscleGroup;
  equipmentTags: EquipmentTag[];
  movementPattern: MovementPattern;
  roleCompatibility: SkeletonSlot[];
  contraindications: ContraindicationTag[];
  substitutions: string[];
  source: ExerciseSource;
  isFavorite: boolean;

  // Phase 1 optional (enrichment / later)
  nameEn?: string;
  nameRu?: string;
  secondaryMuscles?: PrimaryMuscleGroup[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  isCompound?: boolean;
  bodyweight?: boolean;
  stressLevel?: "low" | "medium" | "high";
  defaultSets?: number;
  defaultRepsMin?: number;
  defaultRepsMax?: number;
  defaultRestSeconds?: number;
  rotationPriority?: number;

  // Legacy transitional fields
  muscleGroup?: string;
  equipment?: string;

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

