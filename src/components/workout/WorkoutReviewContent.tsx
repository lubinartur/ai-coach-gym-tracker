"use client";

import { useMemo } from "react";
import { muscleLineForHeroTitle } from "@/lib/aiCoachResultLabels";
import { enforceWorkoutReviewLimits } from "@/lib/workoutReviewDisplay";
import { useI18n } from "@/i18n/LocaleContext";
import type { AppLanguage } from "@/i18n/language";
import type { WorkoutAiReview } from "@/types/aiCoach";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatKg(n: number, locale: AppLanguage): string {
  const v = round2(n);
  const loc = locale === "ru" ? "ru-RU" : "en-US";
  return v.toLocaleString(loc, { maximumFractionDigits: 2 }).replace(/,/g, " ");
}

function scorePresentationClasses(score: number): {
  panel: string;
  value: string;
  pill: string;
} {
  if (score >= 80) {
    return {
      panel: "border-emerald-500/40 bg-emerald-500/[0.09] shadow-sm shadow-emerald-950/20",
      value: "text-emerald-100",
      pill:
        "bg-emerald-500/30 text-emerald-50 ring-1 ring-emerald-400/45 font-semibold",
    };
  }
  if (score >= 60) {
    return {
      panel: "border-amber-500/40 bg-amber-500/[0.09] shadow-sm shadow-amber-950/20",
      value: "text-amber-100",
      pill:
        "bg-amber-500/30 text-amber-50 ring-1 ring-amber-400/50 font-semibold",
    };
  }
  return {
    panel: "border-red-500/45 bg-red-500/[0.09] shadow-sm shadow-red-950/20",
    value: "text-red-100",
    pill: "bg-red-500/30 text-red-100 ring-1 ring-red-400/45 font-semibold",
  };
}

export type WorkoutReviewExerciseRow = {
  id: string;
  label: string;
  setCount: number;
  vol: number;
};

type Props =
  | {
      layout: "postSave";
      title: string;
      durationMin?: number;
      totalSets: number;
      totalVolume: number;
      exerciseRows: WorkoutReviewExerciseRow[];
      aiReview: WorkoutAiReview | null;
      reviewLoading: boolean;
      reviewError: string | null;
    }
  | {
      layout: "inline";
      aiReview: WorkoutAiReview | null;
      reviewLoading: boolean;
      reviewError: string | null;
    };

export function WorkoutReviewContent(props: Props) {
  const { aiReview, reviewLoading, reviewError, layout } = props;
  const { t, locale } = useI18n();
  const displayReview = useMemo(
    () => (aiReview ? enforceWorkoutReviewLimits(aiReview) : null),
    [aiReview],
  );
  const title = layout === "postSave" ? props.title : "";
  const muscle = layout === "postSave" ? muscleLineForHeroTitle(props.title) : null;
  const exerciseRows = layout === "postSave" ? props.exerciseRows : [];
  const totalSets = layout === "postSave" ? props.totalSets : 0;
  const totalVolume = layout === "postSave" ? props.totalVolume : 0;
  const durationMin = layout === "postSave" ? props.durationMin : undefined;

  const durationText =
    typeof durationMin === "number" &&
    Number.isFinite(durationMin) &&
    durationMin > 0
      ? `${durationMin} ${t("min_short")}`
      : t("em_dash");

  const coachDebrief = (
    <>
      {reviewLoading ? (
        <div className="space-y-2">
          <h3 className="text-base font-medium text-neutral-200">
            {t("review_ai_section")}
          </h3>
          <p className="text-base text-neutral-500">{t("review_analyzing")}</p>
        </div>
      ) : reviewError ? (
        <div className="space-y-1">
          <h3 className="text-base font-medium text-neutral-200">
            {t("review_ai_section")}
          </h3>
          <p className="text-base text-amber-200/90">{reviewError}</p>
        </div>
      ) : displayReview ? (
        <div className="space-y-6">
          <p className="text-xs font-medium text-neutral-500">
            {t("review_ai_section")}
          </p>

          {typeof displayReview.score === "number" && Number.isFinite(displayReview.score) ? (() => {
            const s = displayReview.score;
            const pal = scorePresentationClasses(s);
            return (
            <div className={`rounded-2xl border px-4 py-4 ${pal.panel}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                {t("review_workout_score")}
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <p
                  className={`text-4xl font-bold tabular-nums tracking-tight sm:text-5xl ${pal.value}`}
                >
                  {s}
                  <span className="text-xl font-semibold text-white/50 sm:text-2xl">
                    {" "}
                    / 100
                  </span>
                </p>
                {displayReview.grade ? (
                  <span
                    className={`mb-1 inline-flex min-w-[2.5rem] items-center justify-center rounded-full px-3 py-1 text-sm tabular-nums ${pal.pill}`}
                  >
                    {displayReview.grade}
                  </span>
                ) : null}
              </div>
            </div>
            );
          })() : null}

          {displayReview.verdict?.trim() ? (
            <p className="text-base font-medium leading-relaxed text-neutral-100">
              {displayReview.verdict}
            </p>
          ) : null}

          {!displayReview.verdict?.trim() ? (
            <div>
              <h3 className="text-lg font-semibold text-neutral-100">
                {t("review_coach_summary")}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-neutral-200">
                {displayReview.summary}
              </p>
            </div>
          ) : null}

          {displayReview.went_well.length > 0 ? (
            <div>
              <h3 className="text-base font-semibold text-emerald-400/95">
                {t("review_went_well")}
              </h3>
              <ul className="mt-2 list-none space-y-2 text-base leading-relaxed text-neutral-200">
                {displayReview.went_well.map((line, i) => (
                  <li key={`w-${i}`} className="flex gap-2">
                    <span className="shrink-0 text-emerald-500/80">·</span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {displayReview.needs_attention.length > 0 ? (
            <div>
              <h3 className="text-base font-semibold text-amber-200/90">
                {t("review_needs_attention")}
              </h3>
              <ul className="mt-2 list-none space-y-2 text-base leading-relaxed text-neutral-200">
                {displayReview.needs_attention.map((line, i) => (
                  <li key={`a-${i}`} className="flex gap-2">
                    <span className="shrink-0 text-amber-500/70">·</span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {displayReview.next_time.length > 0 ? (
            <div>
              <h3 className="text-base font-semibold text-violet-300/90">
                {t("review_next_session")}
              </h3>
              <ul className="mt-2 list-none space-y-2 text-base leading-relaxed text-neutral-200">
                {displayReview.next_time.map((line, i) => (
                  <li key={`n-${i}`} className="flex gap-2">
                    <span className="shrink-0 text-violet-500/70">·</span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {displayReview.exercise_notes.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-neutral-500">
                {t("review_exercise_notes")}
              </h3>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-300">
                {displayReview.exercise_notes.map((n, i) => (
                  <li key={`${n.name}-${i}`}>
                    <span className="font-medium text-neutral-100">
                      {n.name}
                    </span>
                    <span className="text-neutral-600"> — </span>
                    {n.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (layout === "inline") {
    return <div className="mx-auto max-w-prose space-y-4">{coachDebrief}</div>;
  }

  return (
    <div className="mx-auto max-w-prose space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-400/90">
          {t("workout_complete")}
        </p>
        <h2 className="mt-1 text-2xl font-semibold leading-tight text-neutral-50">
          {title.trim() || t("workout_default_title")}
        </h2>
        {muscle ? (
          <p className="mt-1 text-base text-neutral-400">
            {muscle.replace(/\s*•\s*/g, " · ")}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-medium text-neutral-500">
          {t("review_stats_heading")}
        </h3>
        <div className="mt-2 space-y-2 rounded-2xl border border-neutral-800/90 bg-neutral-900/50 p-4">
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="text-sm text-neutral-500">
              {t("duration_label")}
            </span>
            <span className="text-lg font-semibold tabular-nums text-white">
              {durationText}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="text-sm text-neutral-500">{t("exercises")}</span>
            <span className="text-lg font-semibold text-white">
              {exerciseRows.length}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="text-sm text-neutral-500">
              {t("review_stat_sets")}
            </span>
            <span className="text-lg font-semibold tabular-nums text-white">
              {totalSets}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="text-sm text-neutral-500">
              {t("stat_total_volume")}
            </span>
            <span className="text-lg font-semibold tabular-nums text-white">
              {formatKg(totalVolume, locale)} {t("stat_unit_kg")}
            </span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-neutral-500">
          {t("workout_summary_section")}
        </h3>
        <ul className="mt-2 space-y-2 text-base">
          {exerciseRows.map((ex) => (
            <li
              key={ex.id}
              className="flex items-baseline justify-between gap-3 border-b border-neutral-800/60 pb-2 last:border-0 last:pb-0"
            >
              <span className="min-w-0 font-medium text-neutral-100 [line-height:1.4]">
                {ex.label}
              </span>
              <span className="shrink-0 text-right text-sm text-neutral-400">
                {ex.setCount} {t("label_sets")} · {formatKg(ex.vol, locale)}{" "}
                {t("stat_unit_kg")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-neutral-800/80 pt-6">{coachDebrief}</div>
    </div>
  );
}
