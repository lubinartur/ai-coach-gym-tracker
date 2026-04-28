import { db } from "./database";
import { createId } from "@/lib/id";
import { clearWorkoutHistory } from "@/lib/clearWorkoutHistory";
import { getWorkoutChronologyTime } from "@/lib/workoutChronology";
import { getOrCreateExerciseByName } from "@/db/exercises";
import type { WorkoutAiReview } from "@/types/aiCoach";
import type { WorkoutSession } from "@/types/trainingDiary";
import { setVolumeForWithMultiplier } from "@/lib/workoutSetQuick";

export async function listWorkoutSessions(): Promise<WorkoutSession[]> {
  const rows = await db.workoutSessions.toArray();
  return rows.sort(
    (a, b) => getWorkoutChronologyTime(b) - getWorkoutChronologyTime(a),
  );
}

export async function getWorkoutSessionById(
  id: string,
): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.get(id);
}

export async function saveWorkoutSessionDraft(input: {
  id?: string;
  date: string;
  title: string;
  /** New session: if omitted, defaults to `now`. Edit: omit to keep existing `performedAt`. */
  performedAt?: string;
  durationMin?: number;
  notes?: string;
  exercises: WorkoutSession["exercises"];
}): Promise<WorkoutSession> {
  const now = new Date().toISOString();
  const exercises = await Promise.all(
    input.exercises.map(async (ex) => {
      const exId = ex.exerciseId?.trim();
      const row = exId
        ? await db.exercises.get(exId)
        : await getOrCreateExerciseByName(ex.name, { ensureEnriched: true });
      const resolvedId = row?.id ?? exId ?? (await getOrCreateExerciseByName(ex.name, { ensureEnriched: true })).id;
      const isDumbbell =
        Array.isArray(row?.equipmentTags) && row!.equipmentTags.includes("dumbbell");
      const mult = isDumbbell ? 2 : 1;
      return {
        ...ex,
        exerciseId: resolvedId,
        // Keep the name as a snapshot; do not rewrite user-entered casing/spelling.
        name: ex.name,
        sets: ex.sets.map((s) => ({
          ...s,
          volume: setVolumeForWithMultiplier(s.weight, s.reps, mult),
        })),
      };
    }),
  );

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const totalVolume = exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.volume, 0),
    0,
  );

  const existing = input.id ? await db.workoutSessions.get(input.id) : undefined;
  const isNew = !existing;
  let nextPerformedAt: string | undefined;
  if (isNew) {
    const p = input.performedAt?.trim();
    nextPerformedAt = p || now;
  } else {
    if (input.performedAt === undefined) {
      nextPerformedAt = existing?.performedAt;
    } else {
      const p = input.performedAt.trim();
      nextPerformedAt = p || existing?.performedAt;
    }
  }
  const row: WorkoutSession = {
    id: existing?.id ?? createId(),
    date: input.date,
    title: input.title.trim() || "Workout",
    durationMin:
      typeof input.durationMin === "number" && Number.isFinite(input.durationMin)
        ? input.durationMin
        : undefined,
    notes: input.notes?.trim() || undefined,
    exercises,
    totalVolume,
    totalSets,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    performedAt: nextPerformedAt,
    aiReview: existing?.aiReview,
  };
  await db.workoutSessions.put(row);
  return row;
}

export async function setWorkoutSessionAiReview(
  id: string,
  review: WorkoutAiReview,
): Promise<void> {
  const row = await db.workoutSessions.get(id);
  if (!row) return;
  await db.workoutSessions.put({
    ...row,
    aiReview: review,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteWorkoutSession(id: string): Promise<void> {
  await db.workoutSessions.delete(id);
}

/** Removes a single saved session row (exercises and sets are stored on the row). */
export const deleteWorkout = deleteWorkoutSession;

/** Deletes every row in the workout log. Does not touch exercises or settings. */
export async function clearAllWorkoutSessions(): Promise<void> {
  await clearWorkoutHistory();
}

