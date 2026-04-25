export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "legs"
  | "glutes"
  | "hamstrings"
  | "quads"
  | "calves"
  | "abs"
  | "cardio"
  | "full_body";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "cardio";

export type ExerciseLibraryItem = {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  secondaryMuscles?: MuscleGroup[];
  aliases?: string[];
};
