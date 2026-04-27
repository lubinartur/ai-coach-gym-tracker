import { getCalendarDateInTimezone } from "@/lib/dates";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { PRIMARY_MUSCLE_GROUPS, type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { workingSetsOnly } from "@/lib/exerciseWorkingSets";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";

export const SECONDARY_MUSCLE_CREDIT = 0.35;

export type MuscleVolumeAttributionRule = {
  primaryCredit: number;
  secondaryCreditEach: number;
};

export const DEFAULT_ATTRIBUTION_RULE: MuscleVolumeAttributionRule = {
  primaryCredit: 1,
  secondaryCreditEach: SECONDARY_MUSCLE_CREDIT,
};

export type MuscleVolumeWindow = {
  /** YYYY-MM-DD in the user timezone */
  startInclusive: string;
  /** YYYY-MM-DD in the user timezone */
  endInclusive: string;
  /** Working-set count, metadata-attributed */
  workingSetsByMuscle: Record<PrimaryMuscleGroup, number>;
  /** Sum of (weight * reps) over working sets, metadata-attributed */
  tonnageByMuscle: Record<PrimaryMuscleGroup, number>;
};

export type CanonicalMuscleVolumeAnalytics = {
  current: MuscleVolumeWindow;
  previous: MuscleVolumeWindow;
  /** Non-overlapping 7-day buckets, oldest first (default 4). */
  history: MuscleVolumeWindow[];
  /** All-time totals across all provided sessions. */
  totals: {
    workingSetsByMuscle: Record<PrimaryMuscleGroup, number>;
    tonnageByMuscle: Record<PrimaryMuscleGroup, number>;
  };
};

type CatalogLookup = {
  byId: Map<string, Exercise>;
  byNorm: Map<string, Exercise>;
};

function emptyMuscleRecord(): Record<PrimaryMuscleGroup, number> {
  const o = {} as Record<PrimaryMuscleGroup, number>;
  for (const m of PRIMARY_MUSCLE_GROUPS) o[m] = 0;
  return o;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

function attributionForExercise(
  exRow: Exercise | null,
  exName: string,
  rule: MuscleVolumeAttributionRule,
): Array<{ muscle: PrimaryMuscleGroup; credit: number }> {
  if (exRow) {
    const primary = exRow.primaryMuscle;
    const out: Array<{ muscle: PrimaryMuscleGroup; credit: number }> = [
      { muscle: primary, credit: rule.primaryCredit },
    ];
    const secondary = (exRow.secondaryMuscles ?? []).filter(Boolean);
    if (secondary.length) {
      for (const m of secondary) {
        out.push({ muscle: m, credit: rule.secondaryCreditEach });
      }
    }
    return out;
  }

  // Unresolved / orphan: attribute to "other" (no name heuristics).
  return [{ muscle: "other", credit: rule.primaryCredit }];
}

function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function inDateRange(
  sessionDate: string,
  startInclusive: string,
  endInclusive: string,
): boolean {
  return (
    compareYmd(sessionDate, startInclusive) >= 0 &&
    compareYmd(sessionDate, endInclusive) <= 0
  );
}

function addCalendarDays(ymd: string, days: number, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Anchor at noon UTC to avoid DST edge cases when formatting to a TZ date.
  const base = new Date(Date.UTC(y, month - 1, day, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return getCalendarDateInTimezone(base, timeZone);
}

function addExerciseToBuckets(input: {
  sessionExercise: WorkoutSession["exercises"][number];
  catalogRow: Exercise | null;
  attributionRule: MuscleVolumeAttributionRule;
  workingSetsByMuscle: Record<PrimaryMuscleGroup, number>;
  tonnageByMuscle: Record<PrimaryMuscleGroup, number>;
}) {
  const ex = input.sessionExercise;
  const work = workingSetsOnly(
    (ex.sets ?? []).map((st) => ({
      weight: Math.max(0, Number(st.weight) || 0),
      reps: Math.max(0, Math.round(Number(st.reps) || 0)),
    })),
  );
  if (work.length === 0) return;

  const rawTonnage = work.reduce((sum, st) => sum + st.weight * st.reps, 0);
  const attribution = attributionForExercise(
    input.catalogRow,
    ex.name,
    input.attributionRule,
  );
  for (const a of attribution) {
    input.workingSetsByMuscle[a.muscle] += work.length * a.credit;
    input.tonnageByMuscle[a.muscle] += rawTonnage * a.credit;
  }
}

function sumInRange(input: {
  sessions: WorkoutSession[];
  catalogLookup: CatalogLookup;
  startInclusive: string;
  endInclusive: string;
  attributionRule: MuscleVolumeAttributionRule;
}): MuscleVolumeWindow {
  const workingSetsByMuscle = emptyMuscleRecord();
  const tonnageByMuscle = emptyMuscleRecord();

  for (const s of input.sessions) {
    if (!s.date || !inDateRange(s.date, input.startInclusive, input.endInclusive)) {
      continue;
    }
    for (const ex of s.exercises ?? []) {
      const row = resolveCatalogExercise(ex, input.catalogLookup);
      addExerciseToBuckets({
        sessionExercise: ex,
        catalogRow: row,
        attributionRule: input.attributionRule,
        workingSetsByMuscle,
        tonnageByMuscle,
      });
    }
  }

  // Keep numbers stable (avoid drifting floats from secondary credits).
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    workingSetsByMuscle[m] = round2(workingSetsByMuscle[m] ?? 0);
    tonnageByMuscle[m] = round2(tonnageByMuscle[m] ?? 0);
  }

  return {
    startInclusive: input.startInclusive,
    endInclusive: input.endInclusive,
    workingSetsByMuscle,
    tonnageByMuscle,
  };
}

function sumAllTime(input: {
  sessions: WorkoutSession[];
  catalogLookup: CatalogLookup;
  attributionRule: MuscleVolumeAttributionRule;
}): { workingSetsByMuscle: Record<PrimaryMuscleGroup, number>; tonnageByMuscle: Record<PrimaryMuscleGroup, number> } {
  const workingSetsByMuscle = emptyMuscleRecord();
  const tonnageByMuscle = emptyMuscleRecord();
  for (const s of input.sessions) {
    for (const ex of s.exercises ?? []) {
      const row = resolveCatalogExercise(ex, input.catalogLookup);
      addExerciseToBuckets({
        sessionExercise: ex,
        catalogRow: row,
        attributionRule: input.attributionRule,
        workingSetsByMuscle,
        tonnageByMuscle,
      });
    }
  }
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    workingSetsByMuscle[m] = round2(workingSetsByMuscle[m] ?? 0);
    tonnageByMuscle[m] = round2(tonnageByMuscle[m] ?? 0);
  }
  return { workingSetsByMuscle, tonnageByMuscle };
}

/**
 * Canonical muscle volume analytics from sessions + canonical Dexie exercise catalog.
 *
 * - Resolves exercises by `exerciseId` first, then normalized name match.
 * - Uses canonical `primaryMuscle` + `secondaryMuscles` for attribution.
 * - Falls back to legacy name heuristic only if no catalog row can be resolved.
 * - Uses working sets only (warm-ups filtered via `workingSetsOnly`).
 */
export function buildCanonicalMuscleVolumeAnalytics(input: {
  sessions: WorkoutSession[];
  catalog: Exercise[];
  timeZone: string;
  /** Default: 4 */
  historyBuckets?: number;
  attributionRule?: MuscleVolumeAttributionRule;
}): CanonicalMuscleVolumeAnalytics {
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const catalog = Array.isArray(input.catalog) ? input.catalog : [];
  const timeZone = input.timeZone || "UTC";
  const buckets = Math.max(0, Math.min(12, Math.floor(input.historyBuckets ?? 4)));
  const attributionRule = input.attributionRule ?? DEFAULT_ATTRIBUTION_RULE;

  const lookup = buildCatalogLookup(catalog);
  const today = getCalendarDateInTimezone(new Date(), timeZone);

  const currentStart = addCalendarDays(today, -6, timeZone);
  const currentEnd = today;
  const prevStart = addCalendarDays(today, -13, timeZone);
  const prevEnd = addCalendarDays(today, -7, timeZone);

  const current = sumInRange({
    sessions,
    catalogLookup: lookup,
    startInclusive: currentStart,
    endInclusive: currentEnd,
    attributionRule,
  });
  const previous = sumInRange({
    sessions,
    catalogLookup: lookup,
    startInclusive: prevStart,
    endInclusive: prevEnd,
    attributionRule,
  });

  const history: MuscleVolumeWindow[] = [];
  for (let i = buckets - 1; i >= 0; i -= 1) {
    const end = addCalendarDays(today, -7 * i, timeZone);
    const start = addCalendarDays(end, -6, timeZone);
    history.push(
      sumInRange({
        sessions,
        catalogLookup: lookup,
        startInclusive: start,
        endInclusive: end,
        attributionRule,
      }),
    );
  }

  const totals = sumAllTime({
    sessions,
    catalogLookup: lookup,
    attributionRule,
  });

  return { current, previous, history, totals };
}

