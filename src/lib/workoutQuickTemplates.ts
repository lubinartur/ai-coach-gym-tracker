export type WorkoutQuickTemplate = {
  id: string;
  label: string;
  muscleLine: string;
  exercises: readonly string[];
  estimatedDurationMin?: number;
  difficulty?: "beginner" | "intermediate";
  focus?: "hypertrophy" | "strength" | "pump" | "light";
};

export const QUICK_WORKOUT_TEMPLATES: readonly WorkoutQuickTemplate[] = [
  {
    id: "push",
    label: "Push",
    muscleLine: "Chest • Shoulders • Triceps",
    exercises: [
      "Barbell Bench Press",
      "Incline Dumbbell Press",
      "Overhead Press",
      "Dumbbell Lateral Raise",
      "Tricep Pushdown",
      "Plank",
    ],
    estimatedDurationMin: 45,
    difficulty: "intermediate",
  },
  {
    id: "pull",
    label: "Pull",
    muscleLine: "Back • Rear delts • Biceps",
    exercises: [
      "Lat Pulldown",
      "Chest-Supported Row",
      "Seated Row",
      "Face Pull",
      "Bicep Curl",
      "Hanging Leg Raise",
    ],
    estimatedDurationMin: 45,
    difficulty: "intermediate",
  },
  {
    id: "legs",
    label: "Legs",
    muscleLine: "Quads • Hamstrings • Glutes",
    exercises: [
      "Leg Press",
      "Romanian Deadlift",
      "Hip Thrust",
      "Leg Curl",
      "Standing Calf Raise",
      "Plank",
    ],
    estimatedDurationMin: 45,
    difficulty: "intermediate",
  },
  {
    id: "upper",
    label: "Upper",
    muscleLine: "Chest • Back • Shoulders",
    exercises: [
      "Bench Press",
      "Lat Pulldown",
      "Dumbbell Shoulder Press",
      "Seated Row",
      "Dumbbell Lateral Raise",
      "Cable Curl",
    ],
    estimatedDurationMin: 45,
    difficulty: "beginner",
  },
  {
    id: "full",
    label: "Full Body",
    muscleLine: "Chest • Back • Legs",
    exercises: [
      "Bench Press",
      "Barbell Row",
      "Leg Press",
      "Hip Thrust",
      "Cable Lateral Raise",
      "Hanging Leg Raise",
    ],
    estimatedDurationMin: 45,
    difficulty: "beginner",
  },
  {
    id: "chest_triceps",
    label: "Chest + Triceps",
    muscleLine: "Chest • Triceps",
    exercises: [
      "Bench Press",
      "Incline Dumbbell Press",
      "Machine Chest Press",
      "Cable Fly",
      "Tricep Pushdown",
      "Overhead Tricep Extension",
    ],
    estimatedDurationMin: 45,
    difficulty: "intermediate",
    focus: "hypertrophy",
  },
  {
    id: "back_biceps",
    label: "Back + Biceps",
    muscleLine: "Back • Biceps",
    exercises: [
      "Lat Pulldown",
      "Chest-Supported Row",
      "Seated Row",
      "Straight-Arm Pulldown",
      "Bicep Curl",
      "Hammer Curl",
    ],
    estimatedDurationMin: 45,
    difficulty: "intermediate",
    focus: "hypertrophy",
  },
  {
    id: "shoulders_arms",
    label: "Shoulders + Arms",
    muscleLine: "Shoulders • Biceps • Triceps",
    exercises: [
      "Dumbbell Shoulder Press",
      "Cable Lateral Raise",
      "Face Pull",
      "Bicep Curl",
      "Tricep Pushdown",
      "Hammer Curl",
    ],
    estimatedDurationMin: 45,
    difficulty: "intermediate",
    focus: "pump",
  },
  {
    id: "legs_core",
    label: "Legs + Core",
    muscleLine: "Legs • Glutes • Core",
    exercises: [
      "Leg Press",
      "Romanian Deadlift",
      "Hip Thrust",
      "Leg Curl",
      "Standing Calf Raise",
      "Hanging Leg Raise",
    ],
    estimatedDurationMin: 45,
    difficulty: "intermediate",
    focus: "hypertrophy",
  },
] as const;
