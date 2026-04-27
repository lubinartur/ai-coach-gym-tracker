import type { PrimaryMuscleGroup as EnginePrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { SkeletonSlot as EngineSkeletonSlot } from "@/lib/workoutSkeleton";

/**
 * Canonical exercise catalog tags and types.
 *
 * Phase 1: Dexie `exercises` becomes the single source of truth, so these unions
 * define the persisted vocabulary used across selection, logging, and analytics.
 */

// Re-export engine types to ensure compatibility at call sites.
export type PrimaryMuscleGroup = EnginePrimaryMuscleGroup;
export type SkeletonSlot = EngineSkeletonSlot;

// Keep a local slot list for validation / migrations.
export const SKELETON_SLOTS = [
  "vertical_pull",
  "horizontal_pull",
  "secondary_back",
  "rear_delt",
  "biceps",
  "core",
  "chest_press",
  "secondary_chest",
  "shoulder_press",
  "lateral_raise",
  "triceps",
  "quad_compound",
  "hinge",
  "single_leg",
  "hamstrings",
  "calves",
] as const satisfies readonly SkeletonSlot[];

// Primary muscle buckets (source of truth lives in the engine module).
// Export here for callers that want the canonical list without importing lib code.
export { PRIMARY_MUSCLE_GROUPS } from "@/lib/exerciseMuscleGroup";

export const EQUIPMENT_TAGS = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "smith",
  "bodyweight",
  "band",
  "kettlebell",
  "trap_bar",
  "ez_bar",
] as const;
export type EquipmentTag = (typeof EQUIPMENT_TAGS)[number];

export const MOVEMENT_PATTERNS = [
  "push_horizontal",
  "push_vertical",
  "pull_vertical",
  "pull_horizontal",
  "squat",
  "hinge",
  "carry",
  "core",
  "isolation",
  "unknown",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const CONTRAINDICATION_TAGS = [
  "shoulder_impingement",
  "low_back_pain",
  "knee_pain",
  "wrist_pain",
  "elbow_pain",
  "hip_pain",
] as const;
export type ContraindicationTag = (typeof CONTRAINDICATION_TAGS)[number];

export const EXERCISE_SOURCES = [
  "library",
  "metadata",
  "custom",
  "imported",
] as const;
export type ExerciseSource = (typeof EXERCISE_SOURCES)[number];

