export type WorkoutQuickTemplate = {
  id: string;
  label: string;
  muscleLine: string;
  exercises: readonly string[];
  estimatedDurationMin?: number;
  difficulty?: "beginner" | "intermediate";
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
] as const;
