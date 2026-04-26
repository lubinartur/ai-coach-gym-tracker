import { normalizeExerciseName } from "@/lib/exerciseName";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { SkeletonSlot } from "@/lib/workoutSkeleton";

export type MovementPattern =
  | "push_horizontal"
  | "push_vertical"
  | "pull_vertical"
  | "pull_horizontal"
  | "squat"
  | "hinge"
  | "carry"
  | "core"
  | "isolation";

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type EquipmentTag =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "smith"
  | "bodyweight"
  | "band"
  | "kettlebell"
  | "trap_bar"
  | "ez_bar";

export type ContraindicationTag =
  | "shoulder_impingement"
  | "low_back_pain"
  | "knee_pain"
  | "wrist_pain"
  | "elbow_pain"
  | "hip_pain";

export type ExerciseMetadataV1 = {
  /** Canonical display name used across the app and AI (must match selected/programmed exercise names). */
  name: string;
  primaryMuscleGroup: PrimaryMuscleGroup;
  secondaryMuscles: PrimaryMuscleGroup[];
  movementPattern: MovementPattern;
  /**
   * Skeleton roles this exercise is eligible for.
   * This enables deterministic role matching without name heuristics.
   */
  roleCompatibility: SkeletonSlot[];
  /** Explicit equipment tags (replaces "unknown equipment" heuristics). */
  equipmentTags: EquipmentTag[];
  difficulty: Difficulty;
  isCompound: boolean;
  /** Systemic/joint stress heuristic at typical loading. */
  stressLevel: "low" | "medium" | "high";
  /** Injury tags that should block this exercise when present in selection constraints. */
  contraindications: ContraindicationTag[];
  /** Canonical exercise names to consider as substitutions (must exist in catalog or metadata). */
  substitutions: string[];
};

export const EXERCISE_METADATA_V1: ExerciseMetadataV1[] = [
  // Push
  {
    name: "Bench Press",
    primaryMuscleGroup: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    movementPattern: "push_horizontal",
    roleCompatibility: ["chest_press"],
    equipmentTags: ["barbell"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "high",
    contraindications: ["shoulder_impingement", "wrist_pain", "elbow_pain"],
    substitutions: ["Dumbbell Bench Press", "Machine Chest Press"],
  },
  {
    name: "Dumbbell Bench Press",
    primaryMuscleGroup: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    movementPattern: "push_horizontal",
    roleCompatibility: ["chest_press", "secondary_chest"],
    equipmentTags: ["dumbbell"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "medium",
    contraindications: ["shoulder_impingement", "wrist_pain", "elbow_pain"],
    substitutions: ["Bench Press", "Machine Chest Press", "Incline Dumbbell Press"],
  },
  {
    name: "Machine Chest Press",
    primaryMuscleGroup: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    movementPattern: "push_horizontal",
    roleCompatibility: ["chest_press", "secondary_chest"],
    equipmentTags: ["machine"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Dumbbell Bench Press", "Bench Press"],
  },
  {
    name: "Incline Dumbbell Press",
    primaryMuscleGroup: "chest",
    secondaryMuscles: ["shoulders", "triceps"],
    movementPattern: "push_horizontal",
    roleCompatibility: ["secondary_chest", "chest_press"],
    equipmentTags: ["dumbbell"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "medium",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Dumbbell Bench Press", "Machine Chest Press"],
  },
  {
    name: "Overhead Press",
    primaryMuscleGroup: "shoulders",
    secondaryMuscles: ["triceps", "core"],
    movementPattern: "push_vertical",
    roleCompatibility: ["shoulder_press"],
    equipmentTags: ["barbell"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "high",
    contraindications: ["shoulder_impingement", "low_back_pain", "wrist_pain"],
    substitutions: ["Dumbbell Shoulder Press"],
  },
  {
    name: "Dumbbell Shoulder Press",
    primaryMuscleGroup: "shoulders",
    secondaryMuscles: ["triceps"],
    movementPattern: "push_vertical",
    roleCompatibility: ["shoulder_press"],
    equipmentTags: ["dumbbell"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "medium",
    contraindications: ["shoulder_impingement", "wrist_pain"],
    substitutions: ["Overhead Press"],
  },
  {
    name: "Dumbbell Lateral Raise",
    primaryMuscleGroup: "shoulders",
    secondaryMuscles: [],
    movementPattern: "isolation",
    roleCompatibility: ["lateral_raise"],
    equipmentTags: ["dumbbell"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Cable Lateral Raise"],
  },
  {
    name: "Cable Lateral Raise",
    primaryMuscleGroup: "shoulders",
    secondaryMuscles: [],
    movementPattern: "isolation",
    roleCompatibility: ["lateral_raise"],
    equipmentTags: ["cable"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Dumbbell Lateral Raise"],
  },
  {
    name: "Tricep Pushdown",
    primaryMuscleGroup: "triceps",
    secondaryMuscles: [],
    movementPattern: "isolation",
    roleCompatibility: ["triceps"],
    equipmentTags: ["cable"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["elbow_pain"],
    substitutions: ["Overhead Tricep Extension"],
  },
  {
    name: "Overhead Tricep Extension",
    primaryMuscleGroup: "triceps",
    secondaryMuscles: [],
    movementPattern: "isolation",
    roleCompatibility: ["triceps"],
    equipmentTags: ["dumbbell", "cable"],
    difficulty: "intermediate",
    isCompound: false,
    stressLevel: "medium",
    contraindications: ["elbow_pain", "shoulder_impingement"],
    substitutions: ["Tricep Pushdown"],
  },
  {
    name: "Plank",
    primaryMuscleGroup: "core",
    secondaryMuscles: ["shoulders"],
    movementPattern: "core",
    roleCompatibility: ["core"],
    equipmentTags: ["bodyweight"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["shoulder_impingement", "wrist_pain"],
    substitutions: ["Hanging Leg Raise"],
  },
  {
    name: "Hanging Leg Raise",
    primaryMuscleGroup: "core",
    secondaryMuscles: ["forearms"],
    movementPattern: "core",
    roleCompatibility: ["core"],
    equipmentTags: ["bodyweight"],
    difficulty: "intermediate",
    isCompound: false,
    stressLevel: "medium",
    contraindications: ["hip_pain", "low_back_pain"],
    substitutions: ["Plank"],
  },

  // Pull
  {
    name: "Pull Up",
    primaryMuscleGroup: "back",
    secondaryMuscles: ["biceps", "forearms"],
    movementPattern: "pull_vertical",
    roleCompatibility: ["vertical_pull"],
    equipmentTags: ["bodyweight"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "high",
    contraindications: ["shoulder_impingement", "elbow_pain"],
    substitutions: ["Lat Pulldown"],
  },
  {
    name: "Lat Pulldown",
    primaryMuscleGroup: "back",
    secondaryMuscles: ["biceps"],
    movementPattern: "pull_vertical",
    roleCompatibility: ["vertical_pull", "secondary_back"],
    equipmentTags: ["cable", "machine"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "medium",
    contraindications: ["shoulder_impingement", "elbow_pain"],
    substitutions: ["Pull Up"],
  },
  {
    name: "Barbell Row",
    primaryMuscleGroup: "back",
    secondaryMuscles: ["biceps", "hamstrings"],
    movementPattern: "pull_horizontal",
    roleCompatibility: ["horizontal_pull", "secondary_back"],
    equipmentTags: ["barbell"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "high",
    contraindications: ["low_back_pain"],
    substitutions: ["Chest-Supported Row", "Seated Row"],
  },
  {
    name: "Seated Row",
    primaryMuscleGroup: "back",
    secondaryMuscles: ["biceps"],
    movementPattern: "pull_horizontal",
    roleCompatibility: ["horizontal_pull", "secondary_back"],
    equipmentTags: ["cable", "machine"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Chest-Supported Row", "Barbell Row"],
  },
  {
    name: "Chest-Supported Row",
    primaryMuscleGroup: "back",
    secondaryMuscles: ["biceps"],
    movementPattern: "pull_horizontal",
    roleCompatibility: ["horizontal_pull", "secondary_back"],
    equipmentTags: ["machine", "dumbbell"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Seated Row", "Barbell Row"],
  },
  {
    name: "Straight-Arm Pulldown",
    primaryMuscleGroup: "back",
    secondaryMuscles: ["shoulders"],
    movementPattern: "pull_vertical",
    roleCompatibility: ["secondary_back"],
    equipmentTags: ["cable"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Lat Pulldown"],
  },
  {
    name: "Face Pull",
    primaryMuscleGroup: "shoulders",
    secondaryMuscles: ["back"],
    movementPattern: "isolation",
    roleCompatibility: ["rear_delt"],
    equipmentTags: ["cable"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Reverse Pec Deck"],
  },
  {
    name: "Reverse Pec Deck",
    primaryMuscleGroup: "shoulders",
    secondaryMuscles: ["back"],
    movementPattern: "isolation",
    roleCompatibility: ["rear_delt"],
    equipmentTags: ["machine"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["shoulder_impingement"],
    substitutions: ["Face Pull"],
  },
  {
    name: "Bicep Curl",
    primaryMuscleGroup: "biceps",
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    roleCompatibility: ["biceps"],
    equipmentTags: ["dumbbell", "cable", "ez_bar"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["elbow_pain", "wrist_pain"],
    substitutions: ["Hammer Curl"],
  },
  {
    name: "Hammer Curl",
    primaryMuscleGroup: "biceps",
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    roleCompatibility: ["biceps"],
    equipmentTags: ["dumbbell"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["elbow_pain", "wrist_pain"],
    substitutions: ["Bicep Curl"],
  },

  // Legs
  {
    name: "Squat",
    primaryMuscleGroup: "legs",
    secondaryMuscles: ["core"],
    movementPattern: "squat",
    roleCompatibility: ["quad_compound"],
    equipmentTags: ["barbell"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "high",
    contraindications: ["knee_pain", "low_back_pain", "hip_pain"],
    substitutions: ["Leg Press", "Bulgarian Split Squat"],
  },
  {
    name: "Leg Press",
    primaryMuscleGroup: "legs",
    secondaryMuscles: [],
    movementPattern: "squat",
    roleCompatibility: ["quad_compound", "single_leg"],
    equipmentTags: ["machine"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "medium",
    contraindications: ["knee_pain", "hip_pain"],
    substitutions: ["Squat", "Bulgarian Split Squat"],
  },
  {
    name: "Romanian Deadlift",
    primaryMuscleGroup: "hamstrings",
    secondaryMuscles: ["back", "core"],
    movementPattern: "hinge",
    roleCompatibility: ["hinge", "hamstrings"],
    equipmentTags: ["barbell", "dumbbell"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "high",
    contraindications: ["low_back_pain", "hip_pain"],
    substitutions: ["Hip Thrust", "Leg Curl"],
  },
  {
    name: "Hip Thrust",
    primaryMuscleGroup: "legs",
    secondaryMuscles: ["hamstrings"],
    movementPattern: "hinge",
    roleCompatibility: ["hinge", "hamstrings"],
    equipmentTags: ["barbell", "machine"],
    difficulty: "beginner",
    isCompound: true,
    stressLevel: "medium",
    contraindications: ["hip_pain", "low_back_pain"],
    substitutions: ["Romanian Deadlift", "Leg Curl"],
  },
  {
    name: "Bulgarian Split Squat",
    primaryMuscleGroup: "legs",
    secondaryMuscles: ["core"],
    movementPattern: "squat",
    roleCompatibility: ["single_leg"],
    equipmentTags: ["dumbbell", "bodyweight"],
    difficulty: "intermediate",
    isCompound: true,
    stressLevel: "high",
    contraindications: ["knee_pain", "hip_pain"],
    substitutions: ["Leg Press"],
  },
  {
    name: "Leg Curl",
    primaryMuscleGroup: "hamstrings",
    secondaryMuscles: [],
    movementPattern: "isolation",
    roleCompatibility: ["hamstrings"],
    equipmentTags: ["machine"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["knee_pain"],
    substitutions: ["Romanian Deadlift", "Hip Thrust"],
  },
  {
    name: "Standing Calf Raise",
    primaryMuscleGroup: "calves",
    secondaryMuscles: [],
    movementPattern: "isolation",
    roleCompatibility: ["calves"],
    equipmentTags: ["machine", "bodyweight", "dumbbell"],
    difficulty: "beginner",
    isCompound: false,
    stressLevel: "low",
    contraindications: ["knee_pain"],
    substitutions: [],
  },
];

const byExact = new Map<string, ExerciseMetadataV1>(
  EXERCISE_METADATA_V1.map((m) => [m.name, m] as const),
);

const byNorm = new Map<string, ExerciseMetadataV1>(
  EXERCISE_METADATA_V1.flatMap((m) => {
    const k = normalizeExerciseName(m.name);
    return k ? ([[k, m]] as const) : [];
  }),
);

export function getExerciseMetadata(name: string): ExerciseMetadataV1 | null {
  const raw = name?.trim();
  if (!raw) return null;
  const exact = byExact.get(raw);
  if (exact) return exact;
  const k = normalizeExerciseName(raw);
  if (!k) return null;
  return byNorm.get(k) ?? null;
}

export function getExerciseMetadataByRole(
  role: SkeletonSlot,
): ExerciseMetadataV1[] {
  return EXERCISE_METADATA_V1.filter((m) => m.roleCompatibility.includes(role));
}

