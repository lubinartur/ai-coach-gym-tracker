import { EXERCISE_LIBRARY } from "@/data/exerciseLibrary";
import { EXERCISE_METADATA_V1 } from "@/data/exerciseMetadata";
import { createId } from "@/lib/id";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { mapCatalogMuscleToPrimary } from "@/lib/exerciseMuscleGroup";
import { db } from "./database";
import type { Exercise } from "@/types/trainingDiary";

/** Single in-flight run (avoids parallel duplicate inserts). Cleared so each new call can sync again. */
let librarySyncInFlight: Promise<LibrarySyncResult> | null = null;
let lastLibrarySyncResult: LibrarySyncResult | null = null;

export type LibrarySyncResult = {
  dexieCount: number;
  libraryCount: number;
  metadataCount: number;
  inserted: number;
  insertedFromLibrary: number;
  insertedFromMetadata: number;
  updated: number;
};

export function getLastLibrarySyncResult(): LibrarySyncResult | null {
  return lastLibrarySyncResult;
}

function clampInt(n: unknown, min: number, max: number): number | undefined {
  const x = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
  if (x == null) return undefined;
  return Math.max(min, Math.min(max, x));
}

function normalizeKey(name: string): string | null {
  const k = normalizeExerciseName(name);
  if (k && k.trim()) return k.trim();
  const t = String(name ?? "").trim().toLowerCase();
  return t ? t : null;
}

function isCustom(row: Exercise): boolean {
  return row.source === "custom";
}

function isMissingArray<T>(v: unknown): v is undefined | null {
  return !Array.isArray(v);
}

function isEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length === 0;
}

function pickPrimaryMuscleFromLibrary(lib: (typeof EXERCISE_LIBRARY)[number]): PrimaryMuscleGroup {
  // `EXERCISE_LIBRARY` uses a wider set (abs/glutes/quads/etc). Phase 1 primary buckets
  // are intentionally coarser; keep it deterministic and safe.
  const fromLegacy = mapCatalogMuscleToPrimary(lib.muscleGroup);
  return fromLegacy ?? "other";
}

export type CatalogEnrichmentResult = LibrarySyncResult & {
  duplicatesDetected: number;
};

/**
 * Inserts any missing `EXERCISE_LIBRARY` rows (by normalized name) and enriches
 * existing library matches with missing/invalid `muscleGroup` or `equipment`
 * (does not override valid user edits, never deletes, never creates duplicates
 * for the same normalized name).
 */
export async function syncExerciseLibraryToDexie(): Promise<LibrarySyncResult> {
  if (typeof window === "undefined") {
    return {
      dexieCount: 0,
      libraryCount: EXERCISE_LIBRARY.length,
      metadataCount: EXERCISE_METADATA_V1.length,
      inserted: 0,
      insertedFromLibrary: 0,
      insertedFromMetadata: 0,
      updated: 0,
    };
  }
  if (librarySyncInFlight) {
    return librarySyncInFlight;
  }
  const run = ensureExerciseCatalogEnriched();
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

/**
 * Phase 1 canonical enrichment pass.
 *
 * Guarantees:
 * - every `EXERCISE_LIBRARY` item exists in Dexie
 * - every `EXERCISE_METADATA_V1` item exists in Dexie
 * - match by `normalizedName` (consistent `normalizeExerciseName`)
 * - never deletes rows
 * - never overwrites `isFavorite`
 * - never overwrites custom exercise names
 * - metadata fills AI-critical fields when missing
 * - library fills missing basics when metadata missing
 */
export async function ensureExerciseCatalogEnriched(): Promise<CatalogEnrichmentResult> {
  if (typeof window === "undefined") {
    return {
      dexieCount: 0,
      libraryCount: EXERCISE_LIBRARY.length,
      metadataCount: EXERCISE_METADATA_V1.length,
      inserted: 0,
      insertedFromLibrary: 0,
      insertedFromMetadata: 0,
      updated: 0,
      duplicatesDetected: 0,
    };
  }

  const now = new Date().toISOString();
  const rows = await db.exercises.toArray();

  // Index by normalizedName. Keep the first row, but prefer custom when duplicates exist.
  const byNorm = new Map<string, Exercise>();
  let duplicatesDetected = 0;
  for (const ex of rows) {
    const k = ex.normalizedName?.trim() || normalizeKey(ex.name);
    if (!k) continue;
    const existing = byNorm.get(k);
    if (!existing) {
      byNorm.set(k, ex);
      continue;
    }
    duplicatesDetected += 1;
    // Prefer custom as the canonical match target (but do not delete duplicates here).
    if (!isCustom(existing) && isCustom(ex)) {
      byNorm.set(k, ex);
    }
  }

  let inserted = 0;
  let insertedFromLibrary = 0;
  let insertedFromMetadata = 0;
  let updated = 0;

  async function upsertMissingBase(input: {
    name: string;
    normalizedName: string;
    source: Exercise["source"];
    muscleGroup?: string;
    equipment?: string;
    // Metadata-driven fields (optional)
    primaryMuscle?: Exercise["primaryMuscle"];
    secondaryMuscles?: Exercise["secondaryMuscles"];
    equipmentTags?: Exercise["equipmentTags"];
    movementPattern?: Exercise["movementPattern"];
    roleCompatibility?: Exercise["roleCompatibility"];
    contraindications?: Exercise["contraindications"];
    substitutions?: Exercise["substitutions"];
    difficulty?: Exercise["difficulty"];
    isCompound?: Exercise["isCompound"];
    stressLevel?: Exercise["stressLevel"];
    bodyweight?: Exercise["bodyweight"];
    defaultSets?: Exercise["defaultSets"];
    defaultRepsMin?: Exercise["defaultRepsMin"];
    defaultRepsMax?: Exercise["defaultRepsMax"];
    defaultRestSeconds?: Exercise["defaultRestSeconds"];
  }): Promise<Exercise> {
    const existing = byNorm.get(input.normalizedName) ?? null;
    if (!existing) {
      const row: Exercise = {
        id: createId(),
        name: input.name,
        normalizedName: input.normalizedName,
        primaryMuscle: input.primaryMuscle ?? "other",
        secondaryMuscles: input.secondaryMuscles,
        equipmentTags: input.equipmentTags ?? [],
        movementPattern: input.movementPattern ?? "unknown",
        roleCompatibility: input.roleCompatibility ?? [],
        contraindications: input.contraindications ?? [],
        substitutions: input.substitutions ?? [],
        difficulty: input.difficulty,
        isCompound: input.isCompound,
        bodyweight: input.bodyweight,
        stressLevel: input.stressLevel,
        defaultSets: input.defaultSets,
        defaultRepsMin: input.defaultRepsMin,
        defaultRepsMax: input.defaultRepsMax,
        defaultRestSeconds: input.defaultRestSeconds,
        muscleGroup: input.muscleGroup,
        equipment: input.equipment,
        source: input.source,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.exercises.put(row);
      byNorm.set(input.normalizedName, row);
      inserted += 1;
      return row;
    }

    // Enrich existing (non-destructive; never overwrite favorite; never rename custom).
    const next: Exercise = { ...existing };
    let changed = false;

    // Always ensure normalizedName is present and consistent for indexing.
    if (!next.normalizedName?.trim()) {
      next.normalizedName = input.normalizedName;
      changed = true;
    }

    // Never overwrite custom exercise names.
    if (!isCustom(existing)) {
      // For non-custom rows, keep name stable but allow filling from sources only if missing/blank.
      if (!next.name?.trim() && input.name.trim()) {
        next.name = input.name;
        changed = true;
      }
    }

    // Never overwrite favorites.
    if (next.isFavorite === undefined) {
      next.isFavorite = false;
      changed = true;
    }

    // Source: keep existing; only backfill if missing.
    if (!next.source) {
      next.source = input.source;
      changed = true;
    }

    // Legacy basics: only fill if missing and not custom.
    if (!isCustom(existing)) {
      if (!next.muscleGroup?.trim() && input.muscleGroup) {
        next.muscleGroup = input.muscleGroup;
        changed = true;
      }
      if (!next.equipment?.trim() && input.equipment) {
        next.equipment = input.equipment;
        changed = true;
      }
    }

    // Canonical fields: preserve existing custom values; otherwise fill missing/defaults.
    const canFill = !isCustom(existing);

    if (!next.primaryMuscle || next.primaryMuscle === "other") {
      if (input.primaryMuscle && (canFill || next.primaryMuscle === "other")) {
        next.primaryMuscle = input.primaryMuscle;
        changed = true;
      }
    }

    if (next.secondaryMuscles === undefined && input.secondaryMuscles?.length) {
      if (canFill) {
        next.secondaryMuscles = input.secondaryMuscles;
        changed = true;
      }
    }

    if (isMissingArray(next.equipmentTags) || isEmptyArray(next.equipmentTags)) {
      if (input.equipmentTags?.length && canFill) {
        next.equipmentTags = input.equipmentTags;
        changed = true;
      } else if (isMissingArray(next.equipmentTags)) {
        next.equipmentTags = [];
        changed = true;
      }
    }

    if (!next.movementPattern || next.movementPattern === "unknown") {
      if (input.movementPattern && canFill) {
        next.movementPattern = input.movementPattern;
        changed = true;
      } else if (!next.movementPattern) {
        next.movementPattern = "unknown";
        changed = true;
      }
    }

    if (isMissingArray(next.roleCompatibility) || isEmptyArray(next.roleCompatibility)) {
      if (input.roleCompatibility?.length && canFill) {
        next.roleCompatibility = input.roleCompatibility;
        changed = true;
      } else if (isMissingArray(next.roleCompatibility)) {
        next.roleCompatibility = [];
        changed = true;
      }
    }

    if (isMissingArray(next.contraindications)) {
      next.contraindications = [];
      changed = true;
    }
    if (isMissingArray(next.substitutions)) {
      next.substitutions = [];
      changed = true;
    }
    if (canFill) {
      if (isEmptyArray(next.contraindications) && input.contraindications?.length) {
        next.contraindications = input.contraindications;
        changed = true;
      }
      if (isEmptyArray(next.substitutions) && input.substitutions?.length) {
        next.substitutions = input.substitutions;
        changed = true;
      }
    }

    if (canFill) {
      if (next.difficulty === undefined && input.difficulty) {
        next.difficulty = input.difficulty;
        changed = true;
      }
      if (next.isCompound === undefined && input.isCompound !== undefined) {
        next.isCompound = input.isCompound;
        changed = true;
      }
      if (next.stressLevel === undefined && input.stressLevel) {
        next.stressLevel = input.stressLevel;
        changed = true;
      }
      if (next.bodyweight === undefined && input.bodyweight !== undefined) {
        next.bodyweight = input.bodyweight;
        changed = true;
      }
      if (next.defaultSets === undefined && input.defaultSets !== undefined) {
        next.defaultSets = input.defaultSets;
        changed = true;
      }
      if (next.defaultRepsMin === undefined && input.defaultRepsMin !== undefined) {
        next.defaultRepsMin = input.defaultRepsMin;
        changed = true;
      }
      if (next.defaultRepsMax === undefined && input.defaultRepsMax !== undefined) {
        next.defaultRepsMax = input.defaultRepsMax;
        changed = true;
      }
      if (next.defaultRestSeconds === undefined && input.defaultRestSeconds !== undefined) {
        next.defaultRestSeconds = input.defaultRestSeconds;
        changed = true;
      }
    }

    // Always ensure required arrays exist even for custom rows.
    if (!Array.isArray(next.equipmentTags)) next.equipmentTags = [];
    if (!Array.isArray(next.roleCompatibility)) next.roleCompatibility = [];
    if (!Array.isArray(next.contraindications)) next.contraindications = [];
    if (!Array.isArray(next.substitutions)) next.substitutions = [];
    if (!next.primaryMuscle) next.primaryMuscle = "other";
    if (!next.movementPattern) next.movementPattern = "unknown";
    if (!next.source) next.source = "library";
    if (next.isFavorite === undefined) next.isFavorite = false;

    if (changed) {
      next.updatedAt = now;
      await db.exercises.put(next);
      updated += 1;
      byNorm.set(input.normalizedName, next);
    }
    return next;
  }

  // 1) Ensure library exists (insert missing; minimal safe enrichment).
  for (const lib of EXERCISE_LIBRARY) {
    const k = normalizeKey(lib.name);
    if (!k) continue;
    const before = byNorm.has(k);
    await upsertMissingBase({
      name: lib.name,
      normalizedName: k,
      source: "library",
      muscleGroup: lib.muscleGroup,
      equipment: lib.equipment,
      primaryMuscle: pickPrimaryMuscleFromLibrary(lib),
      equipmentTags: lib.equipment ? [lib.equipment as unknown as never] : [],
      bodyweight: lib.equipment === "bodyweight",
    });
    if (!before && byNorm.has(k)) insertedFromLibrary += 1;
  }

  // 2) Ensure metadata exists + enrich AI-critical fields (non-destructive).
  for (const m of EXERCISE_METADATA_V1) {
    const k = normalizeKey(m.name);
    if (!k) continue;
    const before = byNorm.has(k);

    // Defaults (optional) — keep conservative, don’t invent too much.
    const defaultSets = clampInt(3, 1, 12);
    const defaultRepsMin = clampInt(8, 1, 50);
    const defaultRepsMax = clampInt(12, 1, 50);
    const defaultRestSeconds = clampInt(90, 0, 1200);

    await upsertMissingBase({
      name: m.name,
      normalizedName: k,
      source: "metadata",
      primaryMuscle: m.primaryMuscleGroup,
      secondaryMuscles: m.secondaryMuscles,
      equipmentTags: (m.equipmentTags ?? []) as unknown as never[],
      movementPattern: m.movementPattern as unknown as Exercise["movementPattern"],
      roleCompatibility: m.roleCompatibility as unknown as Exercise["roleCompatibility"],
      contraindications: m.contraindications as unknown as Exercise["contraindications"],
      substitutions: m.substitutions as unknown as Exercise["substitutions"],
      difficulty: m.difficulty,
      isCompound: m.isCompound,
      stressLevel: m.stressLevel,
      bodyweight: (m.equipmentTags ?? []).includes("bodyweight"),
      defaultSets,
      defaultRepsMin,
      defaultRepsMax,
      defaultRestSeconds,
    });
    if (!before && byNorm.has(k)) insertedFromMetadata += 1;
  }

  // 3) Backfill any remaining required fields for every row (preserve user data).
  const all = await db.exercises.toArray();
  for (const ex of all) {
    const k = ex.normalizedName?.trim() || normalizeKey(ex.name);
    if (!k) continue;
    const next: Exercise = { ...ex };
    let changed = false;

    if (!next.normalizedName?.trim()) {
      next.normalizedName = k;
      changed = true;
    }
    if (!next.primaryMuscle) {
      // Prefer catalog muscle mapping if legacy exists.
      const fromCatalog = mapCatalogMuscleToPrimary(next.muscleGroup);
      next.primaryMuscle = fromCatalog ?? "other";
      changed = true;
    }
    if (!Array.isArray(next.equipmentTags)) {
      next.equipmentTags = [];
      changed = true;
    }
    if (!next.movementPattern) {
      next.movementPattern = "unknown";
      changed = true;
    }
    if (!Array.isArray(next.roleCompatibility)) {
      next.roleCompatibility = [];
      changed = true;
    }
    if (!Array.isArray(next.contraindications)) {
      next.contraindications = [];
      changed = true;
    }
    if (!Array.isArray(next.substitutions)) {
      next.substitutions = [];
      changed = true;
    }
    if (!next.source) {
      next.source = "library";
      changed = true;
    }
    if (next.isFavorite === undefined) {
      next.isFavorite = false;
      changed = true;
    }
    if (!next.createdAt?.trim()) {
      next.createdAt = now;
      changed = true;
    }
    if (!next.updatedAt?.trim()) {
      next.updatedAt = now;
      changed = true;
    }

    if (changed) {
      await db.exercises.put({ ...next, updatedAt: now });
      updated += 1;
    }
  }

  const finalRows = await db.exercises.toArray();
  return {
    dexieCount: finalRows.length,
    libraryCount: EXERCISE_LIBRARY.length,
    metadataCount: EXERCISE_METADATA_V1.length,
    inserted,
    insertedFromLibrary,
    insertedFromMetadata,
    updated,
    duplicatesDetected,
  };
}

export async function listExercises(): Promise<Exercise[]> {
  await syncExerciseLibraryToDexie();
  return db.exercises.orderBy("name").toArray();
}

/**
 * Read-only: find catalog row by normalized name after enrichment. Does not insert.
 */
export async function getCatalogExerciseByNormalizedName(
  name: string,
): Promise<Exercise | null> {
  if (typeof window === "undefined") return null;
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;
  await syncExerciseLibraryToDexie();
  const k = normalizeKey(trimmed);
  if (!k) return null;
  return (await db.exercises.where("normalizedName").equals(k).first()) ?? null;
}

export async function getOrCreateExerciseByName(
  name: string,
  options?: {
    /** Default: true (ensures library+metadata enrichment ran). */
    ensureEnriched?: boolean;
  },
): Promise<Exercise> {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateExerciseByName: must be called in the browser");
  }
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    throw new Error("getOrCreateExerciseByName: name is empty");
  }
  if (options?.ensureEnriched !== false) {
    await syncExerciseLibraryToDexie();
  }
  const k = normalizeKey(trimmed);
  if (!k) {
    // Fallback: create a stable-ish key from the raw name.
    // (Should be very rare; normalizeExerciseName already strips weirdness.)
    const safe = trimmed.toLowerCase();
    return addExercise({ name: safe || "Exercise" });
  }

  const existing =
    (await db.exercises.where("normalizedName").equals(k).first()) ??
    null;
  if (existing) return existing;

  // Create a new canonical custom exercise with Phase 1 required defaults.
  const now = new Date().toISOString();
  const row: Exercise = {
    id: createId(),
    name: trimmed,
    normalizedName: k,
    primaryMuscle: "other",
    equipmentTags: [],
    movementPattern: "unknown",
    roleCompatibility: [],
    contraindications: [],
    substitutions: [],
    source: "custom",
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.exercises.put(row);
  return row;
}

export async function addExercise(input: {
  name: string;
  muscleGroup?: string;
  equipment?: string;
}): Promise<Exercise> {
  const now = new Date().toISOString();
  const name = input.name.trim();
  const normalizedName =
    normalizeExerciseName(name) || name.toLowerCase() || createId();
  const row: Exercise = {
    id: createId(),
    name,
    normalizedName,
    primaryMuscle: "other",
    equipmentTags: input.equipment?.trim()
      ? [input.equipment.trim() as unknown as never]
      : [],
    movementPattern: "unknown",
    roleCompatibility: [],
    contraindications: [],
    substitutions: [],
    muscleGroup: input.muscleGroup?.trim() || undefined,
    equipment: input.equipment?.trim() || undefined,
    source: "custom",
    isFavorite: false,
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
  const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
  const nextNormalizedName =
    existing.normalizedName?.trim() ||
    normalizeExerciseName(nextName) ||
    nextName.trim().toLowerCase() ||
    existing.id;
  const updated: Exercise = {
    ...existing,
    name: nextName,
    normalizedName: nextNormalizedName,
    muscleGroup:
      patch.muscleGroup === null
        ? undefined
        : patch.muscleGroup !== undefined
          ? patch.muscleGroup.trim() || undefined
          : existing.muscleGroup,
    isFavorite: patch.isFavorite === undefined ? existing.isFavorite ?? false : patch.isFavorite,
    updatedAt: new Date().toISOString(),
  };
  await db.exercises.put(updated);
}

export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id);
}

