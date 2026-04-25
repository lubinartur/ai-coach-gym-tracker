import { db } from "./database";
import { SEED_WORKOUT_TEMPLATES } from "./workoutTemplateSeeds";
import type { WorkoutTemplate } from "@/types/training";

export async function listWorkoutTemplates(): Promise<WorkoutTemplate[]> {
  return db.workoutTemplates.orderBy("name").toArray();
}

export async function ensureSeedWorkoutTemplates(): Promise<void> {
  const n = await db.workoutTemplates.count();
  if (n > 0) return;
  await db.workoutTemplates.bulkPut(SEED_WORKOUT_TEMPLATES);
}
