import { normalizeExerciseName } from "@/lib/exerciseName";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { Exercise, WorkoutExercise, WorkoutSet } from "@/types/trainingDiary";

/**
 * O(1) lookup for session rows → catalog rows. Built once per catalog snapshot.
 */
export type CatalogLookup = {
  byId: Map<string, Exercise>;
  byNorm: Map<string, Exercise>;
};

export function buildCatalogLookup(catalog: Exercise[]): CatalogLookup {
  const byId = new Map<string, Exercise>();
  const byNorm = new Map<string, Exercise>();
  for (const e of catalog) {
    if (e.id) byId.set(e.id, e);
    const k =
      (e.normalizedName && e.normalizedName.trim()) || normalizeExerciseName(e.name);
    if (k && !byNorm.has(k)) byNorm.set(k, e);
  }
  return { byId, byNorm };
}

/**
 * Map a session exercise to a Dexie catalog row:
 * 1) `exerciseId` (stable)
 * 2) normalizedName match
 */
export function resolveWorkoutExerciseToCatalogExercise(
  ex: WorkoutExercise,
  catalog: CatalogLookup,
): Exercise | null {
  const byId = ex.exerciseId?.trim();
  if (byId) {
    const row = catalog.byId.get(byId) ?? null;
    if (row) return row;
  }
  const k = normalizeExerciseName(ex.name);
  if (k) {
    return catalog.byNorm.get(k) ?? null;
  }
  return null;
}

export type MuscleAttribution = { muscle: PrimaryMuscleGroup; share: number };

const SECONDARY_SCALE = 0.35;

/**
 * Splits "credit" between primary and secondary catalog muscles for volume-style analytics.
 * Primary: 1; each secondary: SECONDARY_SCALE / n (capped so total does not exceed ~1.35).
 */
export function getExerciseMuscleAttribution(row: Exercise): MuscleAttribution[] {
  const primary: MuscleAttribution = { muscle: row.primaryMuscle, share: 1 };
  const sec = (row.secondaryMuscles ?? []).filter(Boolean);
  if (!sec.length) return [primary];
  const per = SECONDARY_SCALE / sec.length;
  const out: MuscleAttribution[] = [primary, ...sec.map((m) => ({ muscle: m, share: per }))];
  return out;
}

/**
 * Set-count proxy: one unit of work × muscle share. (Used for muscle-balance set charts.)
 */
export function calculateMuscleVolumeFromMetadata(
  row: Exercise,
  setCount: number,
): { muscle: PrimaryMuscleGroup; load: number }[] {
  const n = Math.max(0, setCount);
  if (n === 0) return [];
  return getExerciseMuscleAttribution(row).map(({ muscle, share }) => ({
    muscle,
    load: n * share,
  }));
}

/** 5-bucket view used on History: Chest / Back / Legs / Shoulders / Arms */
export type HistoryBalanceBucket = "Chest" | "Back" | "Legs" | "Shoulders" | "Arms";

export function mapPrimaryToHistoryBalanceBucket(m: PrimaryMuscleGroup): HistoryBalanceBucket | null {
  switch (m) {
    case "chest":
      return "Chest";
    case "back":
      return "Back";
    case "legs":
    case "hamstrings":
    case "calves":
      return "Legs";
    case "shoulders":
      return "Shoulders";
    case "biceps":
    case "triceps":
    case "forearms":
      return "Arms";
    case "core":
    case "other":
      return null;
    default:
      return null;
  }
}

/**
 * Look up a catalog row by normalized exercise name only (suggest-next / insights).
 */
export function resolveCatalogRowByExerciseName(
  name: string,
  catalog: CatalogLookup,
): Exercise | null {
  const k = normalizeExerciseName(name);
  if (!k) return null;
  return catalog.byNorm.get(k) ?? null;
}

export type CatalogStrengthKind = "squat" | "bench" | "deadlift";

/**
 * Classify a main-lift "kind" from canonical catalog metadata (no name regex).
 */
export function catalogExerciseMatchesStrengthKind(
  row: Exercise,
  kind: CatalogStrengthKind,
): boolean {
  const mp = row.movementPattern;
  const p = row.primaryMuscle;

  if (kind === "squat") {
    return mp === "squat";
  }
  if (kind === "bench") {
    return mp === "push_horizontal" && p === "chest";
  }
  // deadlift: hinge + lower-body pull; legs/back/hamstrings primaries
  if (mp !== "hinge") return false;
  return p === "back" || p === "hamstrings" || p === "legs";
}

/**
 * Split filter for suggest-next: uses catalog metadata only. If `row` is null, the exercise
 * is kept (unknownExercise — do not guess from the name string).
 */
export function exerciseMetadataMatchesWorkoutSplit(
  row: Exercise | null,
  split: "push" | "pull" | "legs",
): boolean {
  if (!row) return true;
  const p = row.primaryMuscle;
  const mp = row.movementPattern;
  if (split === "push") {
    return p === "chest" || p === "shoulders" || p === "triceps";
  }
  if (split === "pull") {
    if (p === "back" || p === "biceps" || p === "forearms" || p === "core") return true;
    if (p === "shoulders" && (mp === "pull_vertical" || mp === "pull_horizontal")) {
      return true;
    }
    return false;
  }
  return p === "legs" || p === "hamstrings" || p === "calves";
}

/**
 * Per-session best top-set weight among exercises that match a strength "lift" (metadata first).
 */
export function getSessionTopSetWeightForStrengthKind(
  exercises: WorkoutExercise[],
  catalog: CatalogLookup,
  kind: CatalogStrengthKind,
  setsFilter?: (st: WorkoutSet) => boolean,
): number | null {
  let best = 0;
  let found = false;
  for (const ex of exercises) {
    const row = resolveWorkoutExerciseToCatalogExercise(ex, catalog);
    if (!row || !catalogExerciseMatchesStrengthKind(row, kind)) continue;
    for (const st of ex.sets) {
      if (setsFilter && !setsFilter(st)) continue;
      const w = Math.max(0, Number(st.weight) || 0);
      if (w > best) best = w;
      found = true;
    }
  }
  return found ? best : null;
}
