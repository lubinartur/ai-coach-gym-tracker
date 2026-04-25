import type { WorkoutTemplate } from "@/types/training";

export const SEED_WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: "tpl-chest-shoulders",
    name: "Chest / Shoulders",
    dayType: "chest_shoulders",
    exercises: [
      { label: "Vertical Leg Raise", order: 0 },
      { label: "Barbell Bench Press", order: 1 },
      { label: "Dumbbell Incline Bench Press", order: 2 },
      { label: "Cable Row", order: 3 },
      { label: "Machine Lateral Raise", order: 4 },
      { label: "Dumbbell Rear Delt Raise", order: 5 },
      { label: "Cable Bicep Curl", order: 6 },
    ],
  },
  {
    id: "tpl-back-arms",
    name: "Back / Arms",
    dayType: "back_arms",
    exercises: [
      { label: "Dumbbell Row", order: 0 },
      { label: "Straight-Arm Pulldown", order: 1 },
      { label: "Incline Dumbbell Row", order: 2 },
      { label: "Cable Bicep Curl", order: 3 },
      { label: "Hammer Curls", order: 4 },
    ],
  },
  {
    id: "tpl-legs",
    name: "Legs",
    dayType: "legs",
    exercises: [
      { label: "Romanian Deadlift", order: 0 },
      { label: "Leg Press", order: 1 },
      { label: "Leg Curl", order: 2 },
      { label: "Leg Extension", order: 3 },
      { label: "Machine Hip Abductor", order: 4 },
      { label: "Machine Hip Adductor", order: 5 },
    ],
  },
];
