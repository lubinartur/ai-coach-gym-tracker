import { normalizeExerciseName } from "@/lib/exerciseName";
import { EXERCISE_LIBRARY_RAW } from "./exerciseSegments";
import type { ExerciseLibraryItem } from "./exerciseLibraryTypes";

export type { Equipment, ExerciseLibraryItem, MuscleGroup } from "./exerciseLibraryTypes";

const seenNames = new Set<string>();
const deduped: ExerciseLibraryItem[] = [];
for (const item of EXERCISE_LIBRARY_RAW) {
  const k = normalizeExerciseName(item.name);
  if (k) {
    if (seenNames.has(k)) continue;
    seenNames.add(k);
  }
  deduped.push(item);
}

/** Curated, deduplicated (by primary name) local gym database. */
export const EXERCISE_LIBRARY: ExerciseLibraryItem[] = deduped;

const LIBRARY_BY_KEY = new Map<string, ExerciseLibraryItem>();
for (const item of EXERCISE_LIBRARY) {
  const pk = normalizeExerciseName(item.name);
  if (pk) {
    if (!LIBRARY_BY_KEY.has(pk)) {
      LIBRARY_BY_KEY.set(pk, item);
    }
  }
  for (const a of item.aliases ?? []) {
    const ak = normalizeExerciseName(a);
    if (ak && !LIBRARY_BY_KEY.has(ak)) {
      LIBRARY_BY_KEY.set(ak, item);
    }
  }
}

export function getLibraryItemByName(name: string): ExerciseLibraryItem | undefined {
  const k = normalizeExerciseName(name);
  return k ? LIBRARY_BY_KEY.get(k) : undefined;
}

export const MUSCLE_GROUP_CANONICAL = new Set<string>([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "cardio",
  "full_body",
]);
