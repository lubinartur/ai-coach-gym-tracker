"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SparklineChart } from "@/components/ui/SparklineChart";
import { listExercises } from "@/db/exercises";
import { listWorkoutSessions } from "@/db/workoutSessions";
import { useI18n } from "@/i18n/LocaleContext";
import type { AppLanguage } from "@/i18n/language";
import {
  buildStrengthSeries,
  type StrengthSeriesPoint,
} from "@/lib/analytics/strengthSeries";
import { getWorkoutChronologyTime } from "@/lib/workoutChronology";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatKg(n: number, locale: AppLanguage): string {
  const loc = locale === "ru" ? "ru-RU" : "en-US";
  return n.toLocaleString(loc, { maximumFractionDigits: 1 }).replace(/,/g, " ");
}

function formatTableDate(ymd: string, locale: AppLanguage): string {
  const d = new Date(ymd + "T12:00:00");
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Props = { exerciseId: string };

export function ExerciseProgressView({ exerciseId }: Props) {
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

  const exercise = useMemo(
    () => catalog.find((e) => e.id === exerciseId) ?? null,
    [catalog, exerciseId],
  );

  const sessionsChrono = useMemo(
    () =>
      [...items].sort(
        (a, b) => getWorkoutChronologyTime(a) - getWorkoutChronologyTime(b),
      ),
    [items],
  );

  const series = useMemo(
    () =>
      buildStrengthSeries({
        sessions: sessionsChrono,
        catalog,
        exerciseId,
      }),
    [sessionsChrono, catalog, exerciseId],
  );

  const e1rmCurrent = useMemo(() => {
    if (series.length === 0) return null;
    return series[series.length - 1]!.estimated1RM;
  }, [series]);

  const sparkValues = useMemo(
    () => series.map((p) => p.estimated1RM),
    [series],
  );

  const tableRows: StrengthSeriesPoint[] = useMemo(
    () => [...series].reverse(),
    [series],
  );

  const sparkForChart = useMemo(() => sparkValues.slice(-16), [sparkValues]);

  const e1rmDesc = useMemo(() => {
    if (sparkForChart.length < 1) return t("em_dash");
    const smin = Math.min(...sparkForChart);
    const smax = Math.max(...sparkForChart);
    return `${t("progress_strength_e1rm")} ${Math.round(smin)}–${Math.round(smax)} ${t("stat_unit_kg")}`;
  }, [sparkForChart, t]);

  if (loading) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-full pb-8">
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </main>
    );
  }

  if (!exercise) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-full space-y-4 pb-8">
        <BackLink label={t("exercise_progress_back")} />
        <p className="text-sm text-neutral-400">{t("exercise_progress_not_found")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6 pb-8">
      <header className="space-y-3">
        <BackLink label={t("exercise_progress_back")} />
        <h1 className="text-[24px] font-bold leading-tight text-neutral-50">
          {exercise.name.trim() || t("exercise_progress_untitled")}
        </h1>
        <p className="text-sm text-neutral-500">
          {t("exercise_progress_subtitle")}
        </p>
      </header>

      <section className="space-y-2">
        <SectionHeader title={t("exercise_progress_e1rm_current")} />
        <Card className="!p-5">
          <p className="text-3xl font-semibold tabular-nums text-neutral-50">
            {e1rmCurrent == null
              ? t("em_dash")
              : `${formatKg(e1rmCurrent, locale)} ${t("stat_unit_kg")}`}
          </p>
          {sparkValues.length >= 2 ? (
            <div className="mt-4 flex items-center justify-end">
              <SparklineChart values={sparkForChart} description={e1rmDesc} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">{t("exercise_progress_no_trend")}</p>
          )}
        </Card>
      </section>

      <section className="space-y-2">
        <SectionHeader title={t("exercise_progress_session_table")} />
        <Card className="!p-0 overflow-hidden">
          {tableRows.length === 0 ? (
            <p className="p-5 text-sm text-neutral-500">
              {t("exercise_progress_no_sessions")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3 font-medium">{t("exercise_progress_col_date")}</th>
                    <th className="px-2 py-3 font-medium tabular-nums">
                      {t("exercise_progress_col_weight")}
                    </th>
                    <th className="px-2 py-3 font-medium tabular-nums">
                      {t("exercise_progress_col_reps")}
                    </th>
                    <th className="px-4 py-3 font-medium tabular-nums">
                      {t("exercise_progress_col_e1rm")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr
                      key={`${row.sessionId}-${row.date}`}
                      className="border-b border-neutral-800/80 last:border-0"
                    >
                      <td className="px-4 py-2.5 text-neutral-200">
                        {formatTableDate(row.date, locale)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-neutral-200">
                        {formatKg(row.sourceSet.weight, locale)} {t("stat_unit_kg")}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-neutral-200">
                        {round1(row.sourceSet.reps)}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-neutral-100">
                        {formatKg(row.estimated1RM, locale)} {t("stat_unit_kg")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/history"
      className="inline-flex text-sm font-medium text-violet-400/90 transition-opacity active:opacity-80"
    >
      {label}
    </Link>
  );
}
