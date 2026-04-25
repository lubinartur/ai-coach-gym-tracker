"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { AI_WORKOUT_DRAFT_KEY } from "@/lib/aiWorkoutDraftStorage";
import { listWorkoutSessions } from "@/db/workoutSessions";
import {
  formatWorkoutHistoryDateTime,
  getWorkoutChronologyTime,
} from "@/lib/workoutChronology";
import { useI18n } from "@/i18n/LocaleContext";
import type { AppLanguage } from "@/i18n/language";
import { AiCoachSuggestionResult } from "@/components/ai/AiCoachSuggestionResult";
import { normalizeSuggestNextResponseClient } from "@/lib/aiCoachResponseNormalize";
import { buildAiCoachRequestPayload } from "@/services/aiCoachContext";
import type { AiCoachMode, AiDecisionContext, SuggestNextWorkoutResponse } from "@/types/aiCoach";
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

const secondaryCtaClass =
  "w-full min-h-11 rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-center text-base font-medium text-neutral-200 transition active:opacity-90";

export function HistoryView() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<SuggestNextWorkoutResponse | null>(
    null,
  );
  /** Set when a suggestion is received (same request as `aiResult`) for read-only “Why” signals. */
  const [aiDecisionContext, setAiDecisionContext] = useState<AiDecisionContext | null>(null);
  const [aiMode, setAiMode] = useState<AiCoachMode>("history_based");

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

  const cardClass =
    "rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-neutral-100";

  async function requestNextWorkout() {
    setAiError(null);
    setAiResult(null);
    setAiDecisionContext(null);
    setAiLoading(true);
    try {
      const payload = await buildAiCoachRequestPayload({ aiMode });
      const res = await fetch("/api/ai-coach/suggest-next-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(t("error_suggestion"));
      }
      setAiDecisionContext(payload.aiDecisionContext);
      const parsed: unknown = JSON.parse(text);
      setAiResult(
        normalizeSuggestNextResponseClient(parsed, payload.trainingSignals),
      );
    } catch (e) {
      setAiError(
        e instanceof Error ? e.message : t("error_suggestion"),
      );
    } finally {
      setAiLoading(false);
    }
  }

  function startSuggestedWorkout() {
    if (!aiResult || aiResult.exercises.length === 0) return;
    setAiDecisionContext(null);
    const payload = {
      title: aiResult.title.trim() || "Workout",
      exercises: aiResult.exercises.map((e) => ({
        name: e.name,
        sets: e.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
        })),
      })),
    };
    sessionStorage.setItem(AI_WORKOUT_DRAFT_KEY, JSON.stringify(payload));
    setAiResult(null);
    router.push("/");
  }

  return (
    <main className="flex flex-col gap-6 pb-28">
      <header>
        <h1 className="text-2xl font-bold text-neutral-50">
          {t("screen_progress")}
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          {t("screen_progress_subtitle")}
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : (
        <>
          <div className={`${cardClass} space-y-2`}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">{t("stat_workouts")}</span>
              <span className="font-semibold text-neutral-50">
                {summary.totalWorkouts}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">{t("stat_total_sets")}</span>
              <span className="font-semibold text-neutral-50">
                {summary.totalSets}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">{t("stat_total_volume")}</span>
              <span className="font-semibold tabular-nums text-neutral-50">
                {formatKgDisplay(summary.totalVolume, locale)} {t("stat_unit_kg")}
              </span>
            </div>
          </div>

          <section className="min-w-0">
            <h2 className="text-sm font-medium text-neutral-400">
              {t("ai_coach_title")}
            </h2>
            <Card className="mt-2 !space-y-3 !py-3">
              <p className="text-sm text-neutral-500">
                {t("ai_coach_blurb")}
              </p>
              <div
                className="flex rounded-xl border border-neutral-800 bg-neutral-950/80 p-0.5"
                role="group"
                aria-label={t("ai_coach_title")}
              >
                <button
                  type="button"
                  onClick={() => setAiMode("history_based")}
                  disabled={aiLoading}
                  className={
                    "min-h-10 min-w-0 flex-1 rounded-lg px-2 text-center text-sm font-medium transition " +
                    (aiMode === "history_based"
                      ? "bg-neutral-800 text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-300")
                  }
                >
                  {t("ai_mode_history")}
                </button>
                <button
                  type="button"
                  onClick={() => setAiMode("coach_recommended")}
                  disabled={aiLoading}
                  className={
                    "min-h-10 min-w-0 flex-1 rounded-lg px-2 text-center text-sm font-medium transition " +
                    (aiMode === "coach_recommended"
                      ? "bg-neutral-800 text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-300")
                  }
                >
                  {t("ai_mode_coach")}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void requestNextWorkout()}
                disabled={aiLoading}
                className={secondaryCtaClass + (aiLoading ? " opacity-60" : "")}
              >
                {aiLoading ? t("thinking") : t("suggest_next_workout")}
              </button>
              {aiError ? (
                <p className="text-sm text-red-400/90">{aiError}</p>
              ) : null}
              {aiResult ? (
                <div className="mt-4 min-w-0">
                  <AiCoachSuggestionResult
                    result={aiResult}
                    decisionContext={aiDecisionContext}
                    onStart={startSuggestedWorkout}
                  />
                </div>
              ) : null}
            </Card>
          </section>

          <section>
            <h2 className="text-sm font-medium text-neutral-400">
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
                        className={`${cardClass} active:opacity-90 transition-opacity`}
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
