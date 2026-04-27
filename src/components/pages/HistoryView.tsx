"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SparklineChart } from "@/components/ui/SparklineChart";
import { TrainingConsistencyCard } from "@/components/ui/TrainingConsistencyCard";
import { listWorkoutSessions } from "@/db/workoutSessions";
import {
  formatWorkoutHistoryDateTime,
  getWorkoutChronologyTime,
} from "@/lib/workoutChronology";
import { useI18n } from "@/i18n/LocaleContext";
import type { AppLanguage } from "@/i18n/language";
import type { MessageKey } from "@/i18n/dictionary";
import { listExercises } from "@/db/exercises";
import { getDefaultTimezone } from "@/lib/dates";
import {
  catalogExerciseMatchesStrengthKind,
  type CatalogStrengthKind,
} from "@/services/exerciseCatalogResolve";
import { buildTrainingConsistencyAnalytics } from "@/lib/analytics/consistency";
import { buildCanonicalMuscleVolumeAnalytics } from "@/lib/analytics/muscleVolume";
import type { MuscleVolumeWindow } from "@/lib/analytics/muscleVolume";
import { buildStrengthSeries } from "@/lib/analytics/strengthSeries";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** E.g. 13640 -> "13 640" (space as thousands separator, matching design copy). */
function formatKgDisplay(n: number, locale: AppLanguage): string {
  const v = round2(n);
  const loc = locale === "ru" ? "ru-RU" : "en-US";
  return v.toLocaleString(loc, { maximumFractionDigits: 2 }).replace(/,/g, " ");
}

const WEEKDAY_KEY_ORDER: MessageKey[] = [
  "day_short_mon",
  "day_short_tue",
  "day_short_wed",
  "day_short_thu",
  "day_short_fri",
  "day_short_sat",
  "day_short_sun",
];

function weekdayIndex(d: Date): number {
  const js = d.getDay();
  return (js + 6) % 7;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function formatWorkingSetsDisplay(n: number): string {
  const v = round2(n);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

type MuscleRowDef = {
  labelKey: MessageKey;
  get: (w: MuscleVolumeWindow) => number;
  /** Only show when there is any volume in current or previous window. */
  optional?: boolean;
};

const MUSCLE_VOLUME_ROW_DEFS: MuscleRowDef[] = [
  { labelKey: "muscle_chest", get: (w) => w.workingSetsByMuscle.chest },
  { labelKey: "muscle_back", get: (w) => w.workingSetsByMuscle.back },
  {
    labelKey: "muscle_legs",
    get: (w) => w.workingSetsByMuscle.legs + w.workingSetsByMuscle.hamstrings,
  },
  { labelKey: "muscle_shoulders", get: (w) => w.workingSetsByMuscle.shoulders },
  { labelKey: "muscle_biceps", get: (w) => w.workingSetsByMuscle.biceps },
  { labelKey: "muscle_triceps", get: (w) => w.workingSetsByMuscle.triceps },
  { labelKey: "muscle_core", get: (w) => w.workingSetsByMuscle.core, optional: true },
];

function muscleVolumeTrend(cur: number, prev: number): "up" | "down" | "flat" {
  if (cur <= 0 && prev <= 0) return "flat";
  if (prev <= 0 && cur > 0) return "up";
  if (cur <= 0 && prev > 0) return "down";
  if (cur > prev * 1.05) return "up";
  if (cur < prev * 0.95) return "down";
  return "flat";
}

function pickExerciseIdForLiftRow(
  catalog: Exercise[],
  kind: CatalogStrengthKind,
  points: { exerciseId?: string }[],
): string | null {
  const last = points[points.length - 1]?.exerciseId?.trim();
  if (last) return last;
  for (const e of catalog) {
    const id = e.id?.trim();
    if (id && catalogExerciseMatchesStrengthKind(e, kind)) return id;
  }
  return null;
}

export function HistoryView() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<WorkoutSession[]>([]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [rows, exercises] = await Promise.all([listWorkoutSessions(), listExercises()]);
        if (mounted) {
          setItems(rows);
          setCatalog(exercises);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const displayItems = useMemo(
    () =>
      [...items].sort(
        (a, b) => getWorkoutChronologyTime(b) - getWorkoutChronologyTime(a),
      ),
    [items],
  );

  const timeZone = useMemo(() => getDefaultTimezone(), []);

  const trainingConsistency = useMemo(
    () => buildTrainingConsistencyAnalytics({ sessions: items, timeZone }),
    [items, timeZone],
  );

  const summary = useMemo(() => {
    const totalWorkouts = items.length;
    const totalSets = items.reduce((s, w) => s + w.totalSets, 0);
    const totalVolume = items.reduce((s, w) => s + w.totalVolume, 0);
    return { totalWorkouts, totalSets, totalVolume };
  }, [items]);

  const weeklyLoad = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const byIndex = Array.from({ length: 7 }, () => 0);
    for (const s of displayItems) {
      const t0 = getWorkoutChronologyTime(s);
      if (!t0) continue;
      const dt = new Date(t0);
      if (dt < start) break;
      byIndex[weekdayIndex(dt)] += Math.max(0, s.totalVolume || 0);
    }

    const max = Math.max(...byIndex, 1);
    const days = WEEKDAY_KEY_ORDER.map((key, i) => ({
      key,
      value: byIndex[i]!,
      h: clamp01(byIndex[i]! / max),
    }));
    const total = days.reduce((s, d) => s + d.value, 0);
    return { days, total, max };
  }, [displayItems]);

  const muscleVolume = useMemo(
    () =>
      buildCanonicalMuscleVolumeAnalytics({
        sessions: items,
        catalog,
        timeZone,
      }),
    [items, catalog, timeZone],
  );

  const muscleVolumeRows = useMemo(() => {
    const curW = muscleVolume.current;
    const prevW = muscleVolume.previous;
    return MUSCLE_VOLUME_ROW_DEFS.filter((def) => {
      if (!def.optional) return true;
      return def.get(curW) > 0 || def.get(prevW) > 0;
    }).map((def) => ({
      labelKey: def.labelKey,
      current: def.get(curW),
      previous: def.get(prevW),
    }));
  }, [muscleVolume]);

  const muscleVolumeMax = useMemo(
    () => Math.max(1, ...muscleVolumeRows.map((r) => r.current)),
    [muscleVolumeRows],
  );

  const hasMuscleVolumeData = useMemo(
    () => muscleVolumeRows.some((r) => r.current > 0),
    [muscleVolumeRows],
  );

  const strengthTrend = useMemo(() => {
    const recent = displayItems.slice(0, 12).reverse();
    return (
      [
        { kind: "squat" as const, labelKey: "progress_lift_squat" as const },
        { kind: "bench" as const, labelKey: "progress_lift_bench" as const },
        { kind: "deadlift" as const, labelKey: "progress_lift_deadlift" as const },
      ] as const
    ).map(({ kind, labelKey }) => {
      const points = buildStrengthSeries({ sessions: recent, catalog, liftKind: kind });
      const series = points.map((p) => p.estimated1RM);
      const linkExerciseId = pickExerciseIdForLiftRow(catalog, kind, points);
      return { labelKey, series, linkExerciseId };
    });
  }, [displayItems, catalog]);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6 pb-32">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("life_panel_brand")}
        </p>
        <h1 className="text-[28px] font-bold leading-tight text-neutral-50">
          {t("screen_progress")}
        </h1>
        <p className="text-sm text-neutral-500">
          {t("screen_progress_subtitle")}
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : (
        <>
          <TrainingConsistencyCard
            title={t("progress_section_consistency")}
            score={trainingConsistency.consistencyScore}
            status={trainingConsistency.status}
            currentStreakWeeks={trainingConsistency.currentStreakWeeks}
            daysSinceLastWorkout={trainingConsistency.daysSinceLastWorkout}
            workoutsLast7Days={trainingConsistency.workoutsLast7Days}
            t={t}
          />

          <section className="min-w-0 space-y-2">
            <SectionHeader
              title={t("progress_section_weekly_load")}
              right={
                <div className="text-right text-xs text-neutral-500">
                  <span className="block tabular-nums text-neutral-400">
                    {formatKgDisplay(weeklyLoad.total, locale)} {t("stat_unit_kg")}
                  </span>
                  <span className="block text-[11px] text-neutral-500">
                    {t("stat_scope_last_7_days")}
                  </span>
                </div>
              }
            />
            <Card className="!p-5">
              <div className="flex items-end justify-between gap-2">
                {weeklyLoad.days.map((d) => (
                  <div
                    key={d.key}
                    className="flex min-w-0 flex-1 flex-col items-center gap-2"
                  >
                    <div className="flex h-16 w-full items-end">
                      <div className="relative h-16 w-full rounded-xl bg-neutral-950/40 ring-1 ring-neutral-800/80">
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-xl bg-violet-500/70"
                          style={{ height: `${Math.max(0.12, d.h) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-neutral-500">
                      {t(d.key)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <section className="min-w-0 space-y-2">
            <SectionHeader
              title={t("progress_section_muscle_volume")}
              right={
                <span className="max-w-[58%] text-right text-[11px] leading-snug text-neutral-500">
                  {t("progress_muscle_volume_subtitle")}
                </span>
              }
            />
            <Card className="!p-4">
              {!items.length || !hasMuscleVolumeData ? (
                <p className="text-sm leading-relaxed text-neutral-500">
                  {items.length
                    ? t("progress_muscle_volume_empty")
                    : t("no_workouts_yet")}
                </p>
              ) : (
                <ul className="space-y-3.5">
                  {muscleVolumeRows.map((row) => {
                    const trend = muscleVolumeTrend(row.current, row.previous);
                    const barPct = Math.min(
                      100,
                      Math.max(0, (row.current / muscleVolumeMax) * 100),
                    );
                    const trendSym =
                      trend === "up" ? "↑" : trend === "down" ? "↓" : "—";
                    const trendClass =
                      trend === "up"
                        ? "text-emerald-400/90"
                        : trend === "down"
                          ? "text-amber-400/85"
                          : "text-neutral-500";
                    const trendLabel =
                      trend === "up"
                        ? t("trend_up")
                        : trend === "down"
                          ? t("trend_down")
                          : t("trend_flat");
                    return (
                      <li key={row.labelKey}>
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-neutral-200">
                            {t(row.labelKey)}
                          </span>
                          <div className="shrink-0 text-right">
                            <span
                              className="inline-flex items-baseline gap-1.5 tabular-nums"
                              title={trendLabel}
                            >
                              <span className="text-sm font-medium text-neutral-100">
                                {t("progress_muscle_this_week").replace(
                                  "{{n}}",
                                  formatWorkingSetsDisplay(row.current),
                                )}
                              </span>
                              <span
                                className={"text-xs font-semibold " + trendClass}
                                aria-hidden
                              >
                                {trendSym}
                              </span>
                            </span>
                            <p className="mt-0.5 text-[11px] tabular-nums text-neutral-500">
                              {t("progress_muscle_prev_week").replace(
                                "{{n}}",
                                formatWorkingSetsDisplay(row.previous),
                              )}
                            </p>
                          </div>
                        </div>
                        <ProgressBar value={barPct} tone="neutral" className="h-1.5" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>

          <section className="min-w-0 space-y-2">
            <SectionHeader title={t("progress_section_strength")} />
            <Card className="!p-5">
              <div className="space-y-3">
                {strengthTrend.map((row) => {
                  const last = row.series.length
                    ? row.series[row.series.length - 1]!
                    : null;
                  const spark = row.series.slice(-8);
                  const sparkMin = spark.length ? Math.min(...spark) : 0;
                  const sparkMax = spark.length ? Math.max(...spark) : 0;
                  const e1rmDesc =
                    spark.length >= 1
                      ? `${t("progress_strength_e1rm")} ${Math.round(
                          sparkMin,
                        )}–${Math.round(sparkMax)} ${t("stat_unit_kg")}`
                      : t("em_dash");
                  const href = row.linkExerciseId
                    ? `/progress/${encodeURIComponent(row.linkExerciseId)}`
                    : null;
                  const inner = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-100">
                          {t(row.labelKey)}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {t("progress_strength_e1rm")}:{" "}
                          <span className="font-medium text-neutral-300">
                            {last == null
                              ? t("em_dash")
                              : `${Math.round(last)} ${t("stat_unit_kg")}`}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          {t("progress_strength_series_meta").replace(
                            "{{n}}",
                            String(row.series.length),
                          )}
                        </p>
                        {href ? (
                          <p className="mt-1 text-[11px] font-medium text-violet-400/90">
                            {t("progress_strength_open_detail")}
                          </p>
                        ) : null}
                      </div>
                      {row.series.length >= 2 ? (
                        <SparklineChart values={spark} description={e1rmDesc} />
                      ) : (
                        <div className="h-10 w-28" aria-hidden />
                      )}
                    </>
                  );
                  const shellClass =
                    "flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/30 px-4 py-3 transition-opacity active:opacity-90";
                  if (href) {
                    return (
                      <Link key={row.labelKey} href={href} className={shellClass}>
                        {inner}
                      </Link>
                    );
                  }
                  return (
                    <div key={row.labelKey} className={shellClass}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <section className="min-w-0 space-y-2">
            <SectionHeader title={t("progress_section_totals")} />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label={t("stat_workouts_with_scope")}
                value={summary.totalWorkouts}
                hint={t("stat_scope_all_time")}
              />
              <MetricCard
                label={t("stat_total_sets_with_scope")}
                value={summary.totalSets}
                hint={t("stat_scope_all_time")}
              />
              <MetricCard
                label={t("stat_total_volume_with_scope")}
                value={`${formatKgDisplay(summary.totalVolume, locale)} ${t("stat_unit_kg")}`}
                hint={t("stat_scope_all_time")}
                className="col-span-2"
              />
              <MetricCard
                label={t("stat_volume_last_7_days")}
                value={`${formatKgDisplay(weeklyLoad.total, locale)} ${t("stat_unit_kg")}`}
                hint={t("stat_scope_last_7_days")}
                className="col-span-2"
              />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("workout_history_title")}
            </h2>
            {items.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-400">
                {t("no_workouts_yet")}
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {displayItems.map((w) => {
                  const nEx = w.exercises.length;
                  const hasDur =
                    typeof w.durationMin === "number" && Number.isFinite(w.durationMin);
                  return (
                    <Link key={w.id} href={`/workout/${w.id}`} className="block">
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-neutral-100 transition-opacity active:opacity-90">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          {formatWorkoutHistoryDateTime(w)}
                        </p>
                        <p className="mt-0.5 text-base font-semibold text-neutral-100">
                          {w.title.trim() || t("workout_default_title")}
                        </p>
                        <p className="mt-1.5 text-sm text-neutral-400">
                          {t("duration_label")}:{" "}
                          {hasDur
                            ? `${w.durationMin} ${t("min_short")}`
                            : t("duration_emdash")}
                        </p>
                        <p className="mt-1 text-sm text-neutral-300">
                          {nEx} {t("label_exercises")} · {w.totalSets}{" "}
                          {t("label_sets")} · {formatKgDisplay(w.totalVolume, locale)}{" "}
                          {t("stat_unit_kg")}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
