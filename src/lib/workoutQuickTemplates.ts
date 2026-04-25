export type WorkoutQuickTemplate = {
  id: string;
  label: string;
  muscleLine: string;
  exercises: readonly string[];
};

export const QUICK_WORKOUT_TEMPLATES: readonly WorkoutQuickTemplate[] = [
  {
    id: "push",
    label: "Push",
    muscleLine: "Chest • Shoulders • Triceps",
    exercises: [
      "Barbell Bench Press",
      "Dumbbell Incline Bench Press",
      "Machine Shoulder Press",
      "Machine Lateral Raise",
      "Rope Triceps Pushdown",
    ],
  },
  {
    id: "pull",
    label: "Pull",
    muscleLine: "Back • Biceps",
    exercises: [
      "Pull-ups",
      "Lat Pulldown",
      "Cable Row",
      "Dumbbell Row",
      "Cable Bicep Curl",
    ],
  },
  {
    id: "legs",
    label: "Legs",
    muscleLine: "Quads • Hamstrings • Calves",
    exercises: [
      "Squat",
      "Leg Press",
      "Romanian Deadlift",
      "Leg Curl",
      "Standing Calf Raise",
    ],
  },
  {
    id: "upper",
    label: "Upper",
    muscleLine: "Chest • Back • Shoulders • Arms",
    exercises: [
      "Barbell Bench Press",
      "Lat Pulldown",
      "Dumbbell Shoulder Press",
      "Cable Row",
      "Cable Bicep Curl",
      "Rope Triceps Pushdown",
    ],
  },
  {
    id: "full",
    label: "Full body",
    muscleLine: "Full body",
    exercises: [
      "Squat",
      "Barbell Bench Press",
      "Pull-ups",
      "Romanian Deadlift",
      "Dumbbell Shoulder Press",
    ],
  },
] as const;
