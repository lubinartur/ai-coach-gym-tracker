"use client";

import { useMemo } from "react";
import { muscleLineForHeroTitle } from "@/lib/aiCoachResultLabels";
import { enforceWorkoutReviewLimits } from "@/lib/workoutReviewDisplay";
import { useI18n } from "@/i18n/LocaleContext";
import type { AppLanguage } from "@/i18n/language";
import type { MessageKey } from "@/i18n/dictionary";
import type {
  AiInsight,
  AiInsightType,
  AiTrainingSignalsResponse,
  WorkoutAiReview,
} from "@/types/aiCoach";
import { InsightCard, type InsightTone } from "@/components/ui/InsightCard";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

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

function insightToneFromType(type: AiInsightType): InsightTone {
  switch (type) {
    case "progress":
      return "success";
    case "fatigue":
      return "warning";
    case "risk":
      return "danger";
    case "opportunity":
      return "violet";
    case "balance":
    default:
      return "neutral";
  }
}

function buildInsightsList(r: WorkoutAiReview): AiInsight[] {
  if (r.insights?.length) {
    return r.insights;
  }
  return r.went_well.map((text) => ({
    type: "progress" as const,
    title: "·",
    text,
  }));
}

function buildWarningsList(r: WorkoutAiReview): string[] {
  if (r.warnings?.length) {
    return r.warnings;
  }
  return r.needs_attention;
}

function splitCoachLine(line: string): { title: string; body?: string } {
  const s = (line ?? "").trim();
  if (!s) return { title: "" };
  // Prefer splitting on the first sentence boundary for a “headline + detail” feel.
  const m = s.match(/^(.{6,80}?)[.:!?]\s+(.*)$/);
  if (m) {
    const title = (m[1] ?? "").trim();
    const body = (m[2] ?? "").trim();
    if (title && body) return { title, body };
  }
  return { title: s };
}

type T = (k: MessageKey) => string;

function fatigueKey(f: AiTrainingSignalsResponse["fatigue"]): MessageKey {
  if (f === "low") return "fatigue_low";
  if (f === "moderate") return "fatigue_moderate";
  if (f === "high") return "fatigue_high";
  return "fatigue_unknown";
}

function volumeKey(v: AiTrainingSignalsResponse["volume_trend"]): MessageKey {
  if (v === "up") return "trend_up";
  if (v === "down") return "trend_down";
  if (v === "stable") return "trend_flat";
  return "trend_unknown";
}

function NextWorkoutHint({
  trainingSignals,
  t,
}: {
  trainingSignals: AiTrainingSignalsResponse;
  t: T;
}) {
  const split = (trainingSignals.split ?? "").trim();
  if (!split) return null;
  return (
    <section className="space-y-2" aria-label={t("review_section_next_hint")}>
      <SectionHeader title={t("review_section_next_hint")} />
      <Card className="!p-4">
        <p className="text-sm font-medium leading-relaxed text-neutral-100">
          {t("review_next_hint_lead").replace("{{split}}", split)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          {t("review_next_hint_context")
            .replace("{{fatigue}}", t(fatigueKey(trainingSignals.fatigue)))
            .replace("{{volume}}", t(volumeKey(trainingSignals.volume_trend)))}
        </p>
      </Card>
    </section>
  );
}

export type WorkoutReviewExerciseRow = {
  id: string;
  label: string;
  setCount: number;
  vol: number;
};

type BaseProps = {
  aiReview: WorkoutAiReview | null;
  reviewLoading: boolean;
  reviewError: string | null;
  /** From last suggest-next `training_signals`, when available (e.g. post-finish on Workout). */
  trainingSignals?: AiTrainingSignalsResponse | null;
};

type Props =
  | (BaseProps & {
      layout: "postSave";
      title: string;
      durationMin?: number;
      totalSets: number;
      totalVolume: number;
      exerciseRows: WorkoutReviewExerciseRow[];
    })
  | (BaseProps & {
      layout: "inline";
    });

export function WorkoutReviewContent(props: Props) {
  const { aiReview, reviewLoading, reviewError, layout, trainingSignals } = props;
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

          {buildInsightsList(displayReview).length > 0 ? (
            <section className="space-y-2" aria-label={t("review_section_what_went_well")}>
              <SectionHeader title={t("review_section_what_went_well")} />
              <ul className="space-y-2">
                {buildInsightsList(displayReview).map((ins, i) => {
                  const tone = insightToneFromType(ins.type);
                  const isSyntheticTitle = ins.title === "·";
                  const displayLine = isSyntheticTitle ? ins.text : `${ins.title}. ${ins.text}`.trim();
                  const { title, body } = splitCoachLine(displayLine);
                  return (
                    <li key={`ins-${i}`}>
                      <InsightCard
                        compact
                        tone={tone}
                        indicator="✓"
                        indicatorClassName="text-emerald-400"
                        title={title}
                        body={body}
                        wrap
                        clampBodyLines={3}
                        expandable
                        showMoreLabel={t("show_more")}
                        showLessLabel={t("show_less")}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {buildWarningsList(displayReview).length > 0 ? (
            <section className="space-y-2" aria-label={t("review_section_what_to_adjust")}>
              <SectionHeader title={t("review_section_what_to_adjust")} />
              <ul className="space-y-2">
                {buildWarningsList(displayReview).map((line, i) => {
                  const { title, body } = splitCoachLine(line);
                  return (
                    <li key={`w-${i}`}>
                      <InsightCard
                        compact
                        tone="warning"
                        indicator="⚠"
                        indicatorClassName="text-amber-400"
                        title={title}
                        body={body}
                        wrap
                        clampBodyLines={3}
                        expandable
                        showMoreLabel={t("show_more")}
                        showLessLabel={t("show_less")}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {trainingSignals &&
          typeof trainingSignals.split === "string" &&
          trainingSignals.split.trim() ? (
            <NextWorkoutHint trainingSignals={trainingSignals} t={t} />
          ) : null}

          {displayReview.next_time.length > 0 ? (
            <section className="space-y-2">
              <SectionHeader title={t("review_next_session")} />
              <ul className="space-y-2">
                {displayReview.next_time.map((line, i) => {
                  const { title, body } = splitCoachLine(line);
                  return (
                    <li key={`n-${i}`}>
                      <InsightCard
                        compact
                        tone="violet"
                        indicator="➜"
                        indicatorClassName="text-purple-300"
                        title={title}
                        body={body}
                        wrap
                        clampBodyLines={3}
                        expandable
                        showMoreLabel={t("show_more")}
                        showLessLabel={t("show_less")}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
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
    return <div className="mx-auto min-w-0 max-w-prose space-y-4">{coachDebrief}</div>;
  }

  return (
    <div className="mx-auto min-w-0 max-w-prose space-y-6">
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

      <section className="space-y-2" aria-label={t("review_section_workout_summary")}>
        <SectionHeader title={t("review_section_workout_summary")} />
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Card className="!p-3.5 sm:!p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("stat_total_volume")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-50 sm:text-xl">
              {formatKg(totalVolume, locale)} {t("stat_unit_kg")}
            </p>
          </Card>
          <Card className="!p-3.5 sm:!p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("review_stat_sets")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-50 sm:text-xl">
              {totalSets}
            </p>
          </Card>
          <Card className="!p-3.5 sm:!p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("exercises")}
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-50 sm:text-xl">
              {exerciseRows.length}
            </p>
          </Card>
          <Card className="!p-3.5 sm:!p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("duration_label")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-50 sm:text-xl">
              {durationText}
            </p>
          </Card>
        </div>
      </section>

      {exerciseRows.length > 0 ? (
        <section className="space-y-2" aria-label={t("review_exercise_breakdown")}>
          <SectionHeader title={t("review_exercise_breakdown")} />
          <ul className="space-y-2 text-base">
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
        </section>
      ) : null}

      <div className="border-t border-neutral-800/80 pt-6">{coachDebrief}</div>
    </div>
  );
}
