import { EXERCISE_LIBRARY } from "@/data/exerciseLibrary";
import { createId } from "@/lib/id";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { mapMuscleGroupStringToCanonical } from "@/services/exerciseStats";
import { db } from "./database";
import type { Exercise } from "@/types/trainingDiary";

/** Single in-flight run (avoids parallel duplicate inserts). Cleared so each new call can sync again. */
let librarySyncInFlight: Promise<LibrarySyncResult> | null = null;
let lastLibrarySyncResult: LibrarySyncResult | null = null;

export type LibrarySyncResult = {
  dexieCount: number;
  libraryCount: number;
  inserted: number;
  updated: number;
};

export function getLastLibrarySyncResult(): LibrarySyncResult | null {
  return lastLibrarySyncResult;
}

/**
 * Inserts any missing `EXERCISE_LIBRARY` rows (by normalized name) and enriches
 * existing library matches with missing/invalid `muscleGroup` or `equipment`
 * (does not override valid user edits, never deletes, never creates duplicates
 * for the same normalized name).
 */
export async function syncExerciseLibraryToDexie(): Promise<LibrarySyncResult> {
  if (typeof window === "undefined") {
    return { dexieCount: 0, libraryCount: EXERCISE_LIBRARY.length, inserted: 0, updated: 0 };
  }
  if (librarySyncInFlight) {
    return librarySyncInFlight;
  }
  const run = (async () => {
    const rows = await db.exercises.toArray();
    const now = new Date().toISOString();
    const byNorm = new Map<string, Exercise>();
    for (const ex of rows) {
      const k = normalizeExerciseName(ex.name);
      if (k && !byNorm.has(k)) {
        byNorm.set(k, ex);
      }
    }
    let inserted = 0;
    let updated = 0;
    for (const lib of EXERCISE_LIBRARY) {
      const k = normalizeExerciseName(lib.name);
      if (!k) continue;
      const existing = byNorm.get(k);
      if (!existing) {
        const row: Exercise = {
          id: createId(),
          name: lib.name,
          muscleGroup: lib.muscleGroup,
          equipment: lib.equipment,
          source: "library",
          createdAt: now,
          updatedAt: now,
        };
        await db.exercises.put(row);
        byNorm.set(k, row);
        inserted += 1;
        continue;
      }
      const canMuscle = mapMuscleGroupStringToCanonical(existing.muscleGroup);
      const hasValidMuscle = Boolean(
        existing.muscleGroup?.trim() && canMuscle,
      );
      const userChoseOtherPrimary =
        hasValidMuscle && canMuscle && canMuscle !== lib.muscleGroup;
      if (userChoseOtherPrimary) {
        continue;
      }
      const next: Exercise = { ...existing, updatedAt: now };
      if (!hasValidMuscle) {
        next.muscleGroup = lib.muscleGroup;
      }
      if (!existing.equipment?.trim() && lib.equipment) {
        next.equipment = lib.equipment;
      }
      if (existing.source !== "custom") {
        if (next.muscleGroup !== existing.muscleGroup || next.equipment !== existing.equipment) {
          next.source = "library";
        }
      }
      const changed =
        next.muscleGroup !== existing.muscleGroup ||
        next.equipment !== existing.equipment ||
        next.source !== existing.source;
      if (changed) {
        await db.exercises.put(next);
        updated += 1;
        byNorm.set(k, next);
      }
    }
    const all = await db.exercises.toArray();
    return {
      dexieCount: all.length,
      libraryCount: EXERCISE_LIBRARY.length,
      inserted,
      updated,
    };
  })();
  librarySyncInFlight = run
    .then((r) => {
      lastLibrarySyncResult = r;
      return r;
    })
    .catch((e) => {
      lastLibrarySyncResult = null;
      throw e;
    })
    .finally(() => {
      librarySyncInFlight = null;
    });
  return librarySyncInFlight;
}

export async function listExercises(): Promise<Exercise[]> {
  await syncExerciseLibraryToDexie();
  return db.exercises.orderBy("name").toArray();
}

export async function addExercise(input: {
  name: string;
  muscleGroup?: string;
  equipment?: string;
}): Promise<Exercise> {
  const now = new Date().toISOString();
  const row: Exercise = {
    id: createId(),
    name: input.name.trim(),
    muscleGroup: input.muscleGroup?.trim() || undefined,
    equipment: input.equipment?.trim() || undefined,
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
  await db.exercises.put(row);
  return row;
}

export async function updateExercise(
  id: string,
  patch: {
    name?: string;
    muscleGroup?: string | null;
    isFavorite?: boolean;
  },
): Promise<void> {
  const existing = await db.exercises.get(id);
  if (!existing) return;
  const updated: Exercise = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    muscleGroup:
      patch.muscleGroup === null
        ? undefined
        : patch.muscleGroup !== undefined
          ? patch.muscleGroup.trim() || undefined
          : existing.muscleGroup,
    isFavorite: patch.isFavorite === undefined ? existing.isFavorite : patch.isFavorite,
    updatedAt: new Date().toISOString(),
  };
  await db.exercises.put(updated);
}

export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id);
}

