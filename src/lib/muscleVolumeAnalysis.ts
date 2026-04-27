import { getCalendarDateInTimezone } from "@/lib/dates";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { PRIMARY_MUSCLE_GROUPS, type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { MuscleVolumeHistoryEntry, VolumeTrend } from "@/types/aiCoach";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";
import {
  buildCanonicalMuscleVolumeAnalytics,
  DEFAULT_ATTRIBUTION_RULE,
} from "@/lib/analytics/muscleVolume";

/**
 * Evidence-based weekly working-set ranges (hypertrophy) for the AI; not medical advice.
 */
export const MUSCLE_HYPERTROPHY_SETS_PER_WEEK: Partial<
  Record<PrimaryMuscleGroup, { min: number; max: number }>
> = {
  chest: { min: 10, max: 20 },
  back: { min: 10, max: 20 },
  shoulders: { min: 8, max: 16 },
  legs: { min: 10, max: 20 },
  biceps: { min: 6, max: 14 },
  triceps: { min: 6, max: 14 },
  hamstrings: { min: 8, max: 16 },
  calves: { min: 6, max: 12 },
  forearms: { min: 4, max: 10 },
  core: { min: 6, max: 14 },
};

export type AiCoachMuscleVolumeBlock = {
  /** Rolling 7 calendar days in user TZ, inclusive. */
  weeklyMuscleVolume: Record<PrimaryMuscleGroup, number>;
  /** vs prior 7-day window (days 8–14 back). */
  muscleVolumeTrend: Record<PrimaryMuscleGroup, VolumeTrend>;
  /** Non-overlapping 7-day buckets, oldest first (4 weeks) for future charts. */
  muscleVolumeHistory: MuscleVolumeHistoryEntry[];
  /** Ranges the model should use for volume decisions. */
  muscleHypertrophyRanges: typeof MUSCLE_HYPERTROPHY_SETS_PER_WEEK;
};

function emptyMuscleRecord(): Record<PrimaryMuscleGroup, number> {
  const o = {} as Record<PrimaryMuscleGroup, number>;
  for (const m of PRIMARY_MUSCLE_GROUPS) o[m] = 0;
  return o;
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

export type CatalogLookup = {
  byId: Map<string, Exercise | undefined>;
  byNormName: Map<string, Exercise | undefined>;
};

export function buildCatalogLookup(catalog: Exercise[]): CatalogLookup {
  const byId = new Map<string, Exercise | undefined>();
  const byNormName = new Map<string, Exercise | undefined>();
  for (const e of catalog) {
    byId.set(e.id, e);
    const k =
      (e.normalizedName && e.normalizedName.trim()) || normalizeExerciseName(e.name);
    if (k && !byNormName.has(k)) byNormName.set(k, e);
  }
  return { byId, byNormName };
}

export function resolvePrimaryMuscle(
  ex: WorkoutSession["exercises"][0],
  lookup: CatalogLookup,
): PrimaryMuscleGroup {
  const exRow = ex.exerciseId ? lookup.byId.get(ex.exerciseId) : undefined;
  if (exRow?.primaryMuscle) return exRow.primaryMuscle;

  const byName = lookup.byNormName.get(normalizeExerciseName(ex.name));
  if (byName?.primaryMuscle) return byName.primaryMuscle;

  return "other";
}

function trendForWindow(cur: number, prev: number): VolumeTrend {
  if (cur === 0 && prev === 0) return "unknown";
  if (prev === 0) return cur > 0 ? "up" : "unknown";
  const diff = cur - prev;
  const threshold = Math.max(2, Math.round(0.1 * prev));
  if (Math.abs(diff) <= threshold) return "stable";
  return diff > 0 ? "up" : "down";
}

// Note: `sumWorkingSetsByMuscleInRange` was replaced by the canonical analytics engine
// (`buildCanonicalMuscleVolumeAnalytics`). Keep `resolvePrimaryMuscle` and
// `buildCatalogLookup` for call sites (recovery scoring), but prefer the canonical
// engine for weekly/history analytics.

const HISTORY_BUCKETS = 4;

const UNKNOWN_TRENDS: Record<PrimaryMuscleGroup, VolumeTrend> = {
  ...Object.fromEntries(
    PRIMARY_MUSCLE_GROUPS.map((m) => [m, "unknown" as VolumeTrend]),
  ) as Record<PrimaryMuscleGroup, VolumeTrend>,
};

/**
 * Client-compute muscle volume for suggest-next. Does not read/write Dexie beyond passed-in rows.
 */
export function buildMuscleVolumeAnalysisForPayload(
  sessions: WorkoutSession[],
  timeZone: string,
  catalog: Exercise[],
): AiCoachMuscleVolumeBlock {
  const analytics = buildCanonicalMuscleVolumeAnalytics({
    sessions,
    catalog,
    timeZone,
    historyBuckets: HISTORY_BUCKETS,
    attributionRule: DEFAULT_ATTRIBUTION_RULE,
  });

  const weekly = analytics.current.workingSetsByMuscle;
  const previousWeek = analytics.previous.workingSetsByMuscle;

  const muscleVolumeTrend: Record<PrimaryMuscleGroup, VolumeTrend> = { ...UNKNOWN_TRENDS };
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    muscleVolumeTrend[m] = trendForWindow(weekly[m] ?? 0, previousWeek[m] ?? 0);
  }

  const muscleVolumeHistory: MuscleVolumeHistoryEntry[] = analytics.history.map((h) => ({
    periodStart: h.startInclusive,
    periodEnd: h.endInclusive,
    setsByMuscle: h.workingSetsByMuscle,
  }));

  return {
    weeklyMuscleVolume: weekly,
    muscleVolumeTrend,
    muscleVolumeHistory,
    muscleHypertrophyRanges: MUSCLE_HYPERTROPHY_SETS_PER_WEEK,
  };
}

export const EMPTY_MUSCLE_VOLUME_BLOCK: AiCoachMuscleVolumeBlock = {
  weeklyMuscleVolume: emptyMuscleRecord(),
  muscleVolumeTrend: { ...UNKNOWN_TRENDS },
  muscleVolumeHistory: [],
  muscleHypertrophyRanges: MUSCLE_HYPERTROPHY_SETS_PER_WEEK,
};
