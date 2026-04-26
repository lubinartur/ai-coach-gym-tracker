export type WorkoutSplit = "Pull" | "Push" | "Legs";

export type SkeletonSlot =
  | "vertical_pull"
  | "horizontal_pull"
  | "secondary_back"
  | "rear_delt"
  | "biceps"
  | "core"
  | "chest_press"
  | "secondary_chest"
  | "shoulder_press"
  | "lateral_raise"
  | "triceps"
  | "quad_compound"
  | "hinge"
  | "single_leg"
  | "hamstrings"
  | "calves";

const SKELETONS: Record<WorkoutSplit, SkeletonSlot[]> = {
  Pull: [
    "vertical_pull",
    "horizontal_pull",
    "secondary_back",
    "rear_delt",
    "biceps",
    "core",
  ],
  Push: [
    "chest_press",
    "secondary_chest",
    "shoulder_press",
    "lateral_raise",
    "triceps",
    "core",
  ],
  Legs: [
    "quad_compound",
    "hinge",
    "single_leg",
    "hamstrings",
    "calves",
    "core",
  ],
};

export function getWorkoutSkeleton(split: WorkoutSplit): SkeletonSlot[] {
  return [...SKELETONS[split]];
}

/** Default exercise names per structural slot (used for AI repair + padding). */
export const SLOT_EXERCISES: Record<SkeletonSlot, string[]> = {
  vertical_pull: ["Lat Pulldown", "Pull-ups", "Chin-ups"],
  horizontal_pull: ["Seated Row", "Chest Supported Row", "Cable Row"],
  secondary_back: ["Straight-Arm Pulldown", "Back Extension", "Single-Arm Dumbbell Row"],
  rear_delt: ["Face Pull", "Reverse Pec Deck", "Rear Delt Fly"],
  biceps: ["Cable Curl", "Dumbbell Curl", "Hammer Curl"],
  core: ["Hanging Leg Raise", "Cable Crunch", "Plank"],

  chest_press: ["Barbell Bench Press", "Dumbbell Bench Press", "Machine Chest Press"],
  secondary_chest: ["Incline Dumbbell Press", "Incline Bench Press", "Chest Fly"],
  shoulder_press: ["Dumbbell Shoulder Press", "Machine Shoulder Press", "Overhead Press"],
  lateral_raise: ["Cable Lateral Raise", "Dumbbell Lateral Raise", "Machine Lateral Raise"],
  triceps: ["Tricep Pushdown", "Overhead Tricep Extension", "Skull Crushers"],

  quad_compound: ["Back Squat", "Leg Press", "Front Squat"],
  hinge: ["Romanian Deadlift", "Deadlift", "Hip Thrust"],
  single_leg: ["Bulgarian Split Squat", "Walking Lunge", "Step Up"],
  hamstrings: ["Leg Curl", "Seated Leg Curl", "Nordic Curl"],
  calves: ["Standing Calf Raise", "Seated Calf Raise", "Calf Raise"],
};

export function pickExerciseForSlot(slot: SkeletonSlot, used: Set<string>): string {
  const pool = SLOT_EXERCISES[slot] ?? [];
  for (const name of pool) {
    if (!used.has(name)) return name;
  }
  return pool[0] ?? "Exercise";
}

