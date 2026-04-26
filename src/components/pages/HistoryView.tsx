"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { listWorkoutSessions } from "@/db/workoutSessions";
import {
  formatWorkoutHistoryDateTime,
  getWorkoutChronologyTime,
} from "@/lib/workoutChronology";
import { useI18n } from "@/i18n/LocaleContext";
import type { AppLanguage } from "@/i18n/language";
import type { WorkoutSession } from "@/types/trainingDiary";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** E.g. 13640 -> "13 640" (space as thousands separator, matching design copy). */
function formatKgDisplay(n: number, locale: AppLanguage): string {
  const v = round2(n);
  const loc = locale === "ru" ? "ru-RU" : "en-US";
  return v.toLocaleString(loc, { maximumFractionDigits: 2 }).replace(/,/g, " ");
}

const WEEKDAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function weekdayKey(d: Date): (typeof WEEKDAY_KEYS)[number] {
  // JS: 0=Sun..6=Sat. Convert to Mon-first ordering.
  const js = d.getDay();
  const idx = (js + 6) % 7; // Mon=0..Sun=6
  return WEEKDAY_KEYS[idx]!;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function extractTopWeightForExercise(
  s: WorkoutSession,
  needle: RegExp,
): number | null {
  let best = 0;
  let found = false;
  for (const ex of s.exercises) {
    if (!needle.test(ex.name ?? "")) continue;
    for (const st of ex.sets) {
      const w = Math.max(0, Number(st.weight) || 0);
      if (w > best) best = w;
      found = true;
    }
  }
  return found ? best : null;
}

function Sparkline({ values }: { values: number[] }) {
  const pts = useMemo(() => {
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-6, max - min);
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 100 - ((v - min) / span) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg viewBox="0 0 100 100" className="h-8 w-14">
      <polyline
        points={pts}
        fill="none"
        stroke="rgba(168,85,247,0.9)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HistoryView() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await listWorkoutSessions();
        if (mounted) setItems(rows);
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

    const byDay: Record<(typeof WEEKDAY_KEYS)[number], number> = {
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
      Sun: 0,
    };

    for (const s of displayItems) {
      const t0 = getWorkoutChronologyTime(s);
      if (!t0) continue;
      const dt = new Date(t0);
      if (dt < start) break;
      byDay[weekdayKey(dt)] += Math.max(0, s.totalVolume || 0);
    }

    const max = Math.max(...Object.values(byDay), 1);
    const days = WEEKDAY_KEYS.map((k) => ({
      key: k,
      value: byDay[k],
      h: clamp01(byDay[k] / max),
    }));
    const total = days.reduce((s, d) => s + d.value, 0);
    return { days, total, max };
  }, [displayItems]);

  const muscleBalance = useMemo(() => {
    // UI-only heuristic: bucket set counts by exercise name keywords.
    const buckets = new Map<string, number>([
      ["Chest", 0],
      ["Back", 0],
      ["Legs", 0],
      ["Shoulders", 0],
      ["Arms", 0],
    ]);
    const recent = displayItems.slice(0, 10);
    for (const s of recent) {
      for (const ex of s.exercises) {
        const name = (ex.name ?? "").toLowerCase();
        const sets = ex.sets?.length ?? 0;
        const key =
          /bench|press|fly|chest/.test(name)
            ? "Chest"
            : /row|pull|lat|deadlift|back/.test(name)
              ? "Back"
              : /squat|leg|lunge|quad|ham|string|calf/.test(name)
                ? "Legs"
                : /shoulder|ohp|overhead|raise|delt/.test(name)
                  ? "Shoulders"
                  : /curl|tricep|bicep|arm/.test(name)
                    ? "Arms"
                    : null;
        if (!key) continue;
        buckets.set(key, (buckets.get(key) ?? 0) + sets);
      }
    }
    const rows = [...buckets.entries()].map(([muscle, sets]) => ({ muscle, sets }));
    const max = Math.max(...rows.map((r) => r.sets), 1);
    return rows.map((r) => ({ ...r, pct: Math.round((r.sets / max) * 100) }));
  }, [displayItems]);

  const strengthTrend = useMemo(() => {
    const recent = displayItems.slice(0, 12).reverse(); // oldest -> newest
    const mk = (re: RegExp) =>
      recent
        .map((s) => extractTopWeightForExercise(s, re))
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

    return [
      { label: "Squat", series: mk(/squat/i) },
      { label: "Bench", series: mk(/bench/i) },
      { label: "Deadlift", series: mk(/deadlift/i) },
    ];
  }, [displayItems]);

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6 pb-32">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Life Execution Panel
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
          {/* 4) EXISTING METRICS (MetricCard) */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label={t("stat_workouts")} value={summary.totalWorkouts} />
            <MetricCard label={t("stat_total_sets")} value={summary.totalSets} />
            <MetricCard
              label={t("stat_total_volume")}
              value={`${formatKgDisplay(summary.totalVolume, locale)} ${t("stat_unit_kg")}`}
              className="col-span-2"
            />
          </div>

          {/* 1) WEEKLY TRAINING LOAD */}
          <section className="min-w-0 space-y-2">
            <SectionHeader
              title="Weekly training load"
              right={
                <span className="text-xs tabular-nums text-neutral-500">
                  {formatKgDisplay(weeklyLoad.total, locale)} {t("stat_unit_kg")}
                </span>
              }
            />
            <Card className="!p-5">
              <div className="flex items-end justify-between gap-2">
                {weeklyLoad.days.map((d) => (
                  <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-16 w-full items-end">
                      <div className="relative h-16 w-full rounded-xl bg-neutral-950/40 ring-1 ring-neutral-800/80">
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-xl bg-violet-500/70"
                          style={{ height: `${Math.max(0.12, d.h) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-neutral-500">{d.key}</span>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* 2) MUSCLE BALANCE */}
          <section className="min-w-0 space-y-2">
            <SectionHeader title="Muscle balance" right={<span className="text-xs text-neutral-500">last sessions</span>} />
            <Card className="!p-5">
              <div className="space-y-4">
                {muscleBalance.map((r) => (
                  <div key={r.muscle} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-neutral-200">{r.muscle}</span>
                      <span className="text-sm tabular-nums text-neutral-500">
                        {r.sets} sets
                      </span>
                    </div>
                    <ProgressBar value={r.pct} tone="neutral" />
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* 3) STRENGTH TREND */}
          <section className="min-w-0 space-y-2">
            <SectionHeader title="Strength trend" right={<span className="text-xs text-neutral-500">top set weight</span>} />
            <Card className="!p-5">
              <div className="space-y-3">
                {strengthTrend.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/30 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-100">{row.label}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
                        {row.series.length
                          ? `${Math.round(row.series[row.series.length - 1]!)}` + ` ${t("stat_unit_kg")}`
                          : "—"}
                      </p>
                    </div>
                    {row.series.length >= 2 ? (
                      <Sparkline values={row.series.slice(-8)} />
                    ) : (
                      <div className="h-8 w-14 rounded-xl border border-neutral-800 bg-neutral-950/40" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
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
                    typeof w.durationMin === "number" &&
                    Number.isFinite(w.durationMin);
                  return (
                    <Link key={w.id} href={`/workout/${w.id}`} className="block">
                      <div
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-neutral-100 transition-opacity active:opacity-90"
                      >
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
