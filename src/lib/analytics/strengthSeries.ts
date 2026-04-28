import { normalizeExerciseName } from "@/lib/exerciseName";
import { catalogExerciseMatchesStrengthKind, type CatalogStrengthKind } from "@/services/exerciseCatalogResolve";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";
import type {
  OneRepMaxFormula,
  OneRepMaxEstimate,
  StrengthSetLike,
} from "@/lib/analytics/oneRepMax";
import { getBestEstimatedOneRepMaxFromSets } from "@/lib/analytics/oneRepMax";

export type LiftKind = CatalogStrengthKind;

export type StrengthSeriesPoint = {
  date: string;
  sessionId: string;
  exerciseId?: string;
  exerciseName: string;
  estimated1RM: number;
  formula: OneRepMaxFormula;
  sourceSet: { weight: number; reps: number };
};

type CatalogLookup = {
  byId: Map<string, Exercise>;
  byNorm: Map<string, Exercise>;
};

function buildCatalogLookup(catalog: Exercise[]): CatalogLookup {
  const byId = new Map<string, Exercise>();
  const byNorm = new Map<string, Exercise>();
  for (const e of catalog) {
    if (e.id) byId.set(e.id, e);
    const k = e.normalizedName?.trim() || normalizeExerciseName(e.name);
    if (k && !byNorm.has(k)) byNorm.set(k, e);
  }
  return { byId, byNorm };
}

function resolveCatalogExercise(
  ex: WorkoutSession["exercises"][number],
  lookup: CatalogLookup,
): Exercise | null {
  const id = ex.exerciseId?.trim();
  if (id) {
    const row = lookup.byId.get(id) ?? null;
    if (row) return row;
  }
  const k = normalizeExerciseName(ex.name);
  if (k) return lookup.byNorm.get(k) ?? null;
  return null;
}

function matchesLiftKind(row: Exercise | null, kind: LiftKind): boolean {
  if (!row) return false;
  return catalogExerciseMatchesStrengthKind(row, kind);
}

function toStrengthSets(ex: WorkoutSession["exercises"][number]): StrengthSetLike[] {
  return (ex.sets ?? []).map((st) => ({
    weight: Number(st.weight) || 0,
    reps: Number(st.reps) || 0,
  }));
}

function bestEstimateForExercise(
  ex: WorkoutSession["exercises"][number],
  formula: OneRepMaxFormula,
): OneRepMaxEstimate | null {
  return getBestEstimatedOneRepMaxFromSets(toStrengthSets(ex), { formula });
}

function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Build a time series of best estimated 1RM per session.
 *
 * Selection:
 * - If `exerciseId` is provided: only that exercise is considered (name fallback if old sessions lack id).
 * - Else if `liftKind` is provided: uses catalog metadata (movementPattern + primaryMuscle) only.
 */
export function buildStrengthSeries(input: {
  sessions: WorkoutSession[];
  catalog: Exercise[];
  liftKind?: LiftKind;
  exerciseId?: string;
  formula?: OneRepMaxFormula;
}): StrengthSeriesPoint[] {
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const catalog = Array.isArray(input.catalog) ? input.catalog : [];
  const formula: OneRepMaxFormula = input.formula ?? "epley";

  const lookup = buildCatalogLookup(catalog);

  const targetExerciseId = input.exerciseId?.trim() || undefined;
  const targetLiftKind = input.liftKind;

  const points: StrengthSeriesPoint[] = [];

  for (const s of sessions) {
    if (!s?.id || !s.date) continue;

    let best: StrengthSeriesPoint | null = null;

    for (const ex of s.exercises ?? []) {
      const row = resolveCatalogExercise(ex, lookup);

      if (targetExerciseId) {
        const resolvedId = (row?.id ?? ex.exerciseId?.trim()) || undefined;
        if (resolvedId !== targetExerciseId) {
          // Fallback: allow old sessions without ids to match by normalizedName against the target exercise row.
          const targetRow = lookup.byId.get(targetExerciseId) ?? null;
          const k1 = normalizeExerciseName(ex.name);
          const k2 = targetRow ? (targetRow.normalizedName?.trim() || normalizeExerciseName(targetRow.name)) : null;
          if (!k1 || !k2 || k1 !== k2) continue;
        }
      } else if (targetLiftKind) {
        if (!matchesLiftKind(row, targetLiftKind)) continue;
      } else {
        // If neither selector is provided, nothing to build.
        continue;
      }

      const est = bestEstimateForExercise(ex, formula);
      if (!est) continue;

      const resolvedExerciseId = (row?.id ?? ex.exerciseId?.trim()) || undefined;
      const exerciseName = (row?.name && row.name.trim()) || ex.name || "Exercise";

      const cand: StrengthSeriesPoint = {
        date: s.date,
        sessionId: s.id,
        exerciseId: resolvedExerciseId,
        exerciseName,
        estimated1RM: est.estimated1RM,
        formula: est.formula,
        sourceSet: { ...est.source },
      };
      if (!best || cand.estimated1RM > best.estimated1RM) best = cand;
    }

    if (best) {
      points.push(best);
    }
  }

  // Stable chronological order (oldest -> newest).
  points.sort((a, b) => compareYmd(a.date, b.date) || a.sessionId.localeCompare(b.sessionId));
  return points;
}

