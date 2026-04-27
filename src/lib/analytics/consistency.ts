import { getCalendarDateInTimezone, getDefaultTimezone } from "@/lib/dates";
import { getWorkoutChronologyTime } from "@/lib/workoutChronology";
import type { WorkoutSession } from "@/types/trainingDiary";

export type ConsistencyStatus = "low" | "moderate" | "good" | "excellent";

export type TrainingConsistencyAnalytics = {
  workoutsLast7Days: number;
  workoutsLast30Days: number;
  activeTrainingDaysLast7: number;
  activeTrainingDaysLast30: number;
  averageWorkoutsPerWeek: number;
  daysSinceLastWorkout: number | null;
  currentStreakWeeks: number;
  consistencyScore: number; // 0..100
  status: ConsistencyStatus;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function addCalendarDays(ymd: string, days: number, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Anchor at noon UTC to avoid DST edges when formatting to a TZ date.
  const base = new Date(Date.UTC(y, month - 1, day, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return getCalendarDateInTimezone(base, timeZone);
}

function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function ymdToUtcNoon(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(y, month - 1, day, 12, 0, 0));
  return Number.isFinite(d.getTime()) ? d : null;
}

function weekStartYmdMonFirst(ymd: string): string {
  const d = ymdToUtcNoon(ymd);
  if (!d) return ymd;
  // JS: 0=Sun..6=Sat. Convert to Mon-first offset.
  const js = d.getUTCDay();
  const delta = (js + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusFromScore(score: number): ConsistencyStatus {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 45) return "moderate";
  return "low";
}

function scoreConsistency(input: {
  activeDays7: number;
  targetDaysPerWeek: number;
  currentStreakWeeks: number;
  daysSinceLastWorkout: number | null;
}): number {
  const target = Math.max(1, Math.min(7, Math.floor(input.targetDaysPerWeek)));
  const dayFrac = clamp01(input.activeDays7 / target);
  const scoreDays = 70 * dayFrac;

  const streakFrac = clamp01(input.currentStreakWeeks / 8);
  const scoreStreak = 20 * streakFrac;

  let scoreRecency = 0;
  const dslw = input.daysSinceLastWorkout;
  if (dslw == null) scoreRecency = 0;
  else if (dslw <= 2) scoreRecency = 10;
  else if (dslw <= 4) scoreRecency = 6;
  else if (dslw <= 7) scoreRecency = 3;
  else scoreRecency = 0;

  return Math.max(0, Math.min(100, Math.round(scoreDays + scoreStreak + scoreRecency)));
}

function sessionYmdInTimezone(s: WorkoutSession, timeZone: string): string | null {
  // Use the same chronology time the app uses for history ordering where possible.
  const t = getWorkoutChronologyTime(s);
  if (t && Number.isFinite(t) && t > 0) {
    return getCalendarDateInTimezone(new Date(t), timeZone);
  }
  const fromDate = String(s.date ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return fromDate;
  return null;
}

export function buildTrainingConsistencyAnalytics(input: {
  sessions: WorkoutSession[];
  timeZone?: string;
  targetDaysPerWeek?: number;
}): TrainingConsistencyAnalytics {
  const timeZone = input.timeZone?.trim() || getDefaultTimezone() || "UTC";
  const targetDaysPerWeek = Math.max(
    1,
    Math.min(7, Math.floor(input.targetDaysPerWeek ?? 3)),
  );

  const sessions = Array.isArray(input.sessions) ? input.sessions : [];

  const today = getCalendarDateInTimezone(new Date(), timeZone);
  const start7 = addCalendarDays(today, -6, timeZone);
  const start30 = addCalendarDays(today, -29, timeZone);

  let workoutsLast7Days = 0;
  let workoutsLast30Days = 0;
  const days7 = new Set<string>();
  const days30 = new Set<string>();
  const allTrainingDays = new Set<string>();

  for (const s of sessions) {
    const ymd = sessionYmdInTimezone(s, timeZone);
    if (!ymd) continue;
    allTrainingDays.add(ymd);
    if (compareYmd(ymd, start30) >= 0 && compareYmd(ymd, today) <= 0) {
      workoutsLast30Days += 1;
      days30.add(ymd);
      if (compareYmd(ymd, start7) >= 0) {
        workoutsLast7Days += 1;
        days7.add(ymd);
      }
    }
  }

  const activeTrainingDaysLast7 = days7.size;
  const activeTrainingDaysLast30 = days30.size;

  // Average workouts per week (last 30 days).
  const averageWorkoutsPerWeek = round1(workoutsLast30Days / (30 / 7));

  // Days since last workout (chronology time).
  const mostRecentMs = Math.max(
    0,
    ...sessions
      .map((s) => getWorkoutChronologyTime(s))
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t > 0),
  );
  const daysSinceLastWorkout =
    mostRecentMs > 0
      ? Math.max(0, Math.floor((Date.now() - mostRecentMs) / (1000 * 60 * 60 * 24)))
      : null;

  // Current streak in weeks (Mon-first weeks) with at least one training day.
  const weekKeys = new Set<string>();
  for (const ymd of allTrainingDays) {
    weekKeys.add(weekStartYmdMonFirst(ymd));
  }
  const thisWeekKey = weekStartYmdMonFirst(today);
  let currentStreakWeeks = 0;
  // Walk backwards week-by-week from current week while a training day exists in that week.
  for (let i = 0; i < 260; i += 1) {
    const wk = addCalendarDays(thisWeekKey, -7 * i, timeZone);
    if (!weekKeys.has(wk)) break;
    currentStreakWeeks += 1;
  }

  const consistencyScore = scoreConsistency({
    activeDays7: activeTrainingDaysLast7,
    targetDaysPerWeek,
    currentStreakWeeks,
    daysSinceLastWorkout,
  });

  return {
    workoutsLast7Days,
    workoutsLast30Days,
    activeTrainingDaysLast7,
    activeTrainingDaysLast30,
    averageWorkoutsPerWeek,
    daysSinceLastWorkout,
    currentStreakWeeks,
    consistencyScore,
    status: statusFromScore(consistencyScore),
  };
}

