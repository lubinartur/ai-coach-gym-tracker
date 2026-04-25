"use client";

import { useMemo, useState } from "react";
import { findBaselineForExerciseName } from "@/lib/aiCoachResponseNormalize";
import {
  buildWhyRowsFromTrainingSignalsResponse,
  formatLastToTodayLine,
  whyRowLabelKey,
} from "@/lib/aiCoachDisplay";
import { localizeDecisionLabel, translateSessionType, translateStrategyValue } from "@/lib/aiCoachResultLabels";
import type { AiDecisionContext, ExerciseDecision, SuggestNextWorkoutAiExercise, SuggestNextWorkoutResponse } from "@/types/aiCoach";
import type { MessageKey } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LocaleContext";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { ProgressBar, type ProgressTone } from "@/components/ui/ProgressBar";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ExerciseCard } from "@/components/ui/ExerciseCard";
import { InsightCard, type InsightTone } from "@/components/ui/InsightCard";

type T = (k: MessageKey) => string;

function formatSetsChained(ex: SuggestNextWorkoutAiExercise): string {
  if (!ex.sets.length) return "—";
  return ex.sets
    .map((s) => {
      const w = Math.round(s.weight * 100) / 100;
      return `${w}×${s.reps}`;
    })
    .join(" · ");
}

function formatSetsLines(ex: SuggestNextWorkoutAiExercise): string {
  if (!ex.sets.length) return "—";
  return ex.sets
    .map((s) => {
      const w = Math.round(s.weight * 100) / 100;
      return `${w}×${s.reps}`;
    })
    .join("\n");
}

function decisionTone(decision: ExerciseDecision): TagTone {
  switch (decision) {
    case "increase":
      return "violet";
    case "reduce":
      return "warning";
    case "technique":
      return "warning";
    case "volume":
      return "violet";
    case "maintain":
    default:
      return "neutral";
  }
}

function recoveryTone(status: "ready" | "moderate" | "fatigued" | "unknown"): ProgressTone {
  switch (status) {
    case "ready":
      return "ready";
    case "moderate":
      return "moderate";
    case "fatigued":
      return "fatigued";
    case "unknown":
    default:
      return "neutral";
  }
}

function insightTone(kind: SuggestNextWorkoutResponse["insights"][number]["type"]): InsightTone {
  switch (kind) {
    case "progress":
      return "success";
    case "fatigue":
      return "warning";
    case "balance":
      return "danger";
    case "risk":
      return "danger";
    case "opportunity":
      return "violet";
    default:
      return "neutral";
  }
}

function estimateDurationMin(ctx: AiDecisionContext | null): number | null {
  if (!ctx) return null;
  const ds = ctx.recentWorkouts
    .map((w) => (typeof w.durationMin === "number" && Number.isFinite(w.durationMin) ? w.durationMin : null))
    .filter((n): n is number => typeof n === "number" && n > 0)
    .slice(0, 4);
  if (ds.length === 0) return null;
  const avg = ds.reduce((s, n) => s + n, 0) / ds.length;
  // Round to nearest 5 min for dashboard-style estimate.
  return Math.max(0, Math.round(avg / 5) * 5);
}

function WhyCallout({
  body,
  t,
}: {
  body: string;
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const text = body.trim();
  if (!text) return null;
  const long = text.length > 220 || (text.match(/\n/g) ?? []).length > 2;
  return (
    <section className="space-y-2">
      <SectionHeader title={t("why_this_workout")} />
      <Card className="!p-5">
        <p
          className={
            "text-sm leading-relaxed text-neutral-200/90 " +
            (!open && long ? "line-clamp-3" : "")
          }
        >
          {text}
        </p>
        {long ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 text-sm font-medium text-violet-400/95 hover:text-violet-300"
          >
            {open ? t("show_less") : t("show_more")}
          </button>
        ) : null}
      </Card>
    </section>
  );
}

type Props = {
  result: SuggestNextWorkoutResponse;
  decisionContext: AiDecisionContext | null;
  onStart: () => void;
};

export function AiCoachSuggestionResult({ result, decisionContext, onStart }: Props) {
  const { t, locale } = useI18n();
  const rows = buildWhyRowsFromTrainingSignalsResponse(result.training_signals, t);
  const sessionPill = translateSessionType(result.session_type, t);
  const split = (result.training_signals?.split ?? "").trim() || result.title.trim() || t("suggested_workout");
  const strategyRow = rows.find((r) => r.kind === "strategy");
  const fatigueRow = rows.find((r) => r.kind === "fatigue");
  const volumeRow = rows.find((r) => r.kind === "volume");
  const durationMin = estimateDurationMin(decisionContext);
  const totalSets = result.exercises.reduce((s, ex) => s + (ex.sets?.length ?? 0), 0);

  const recoveryRows = useMemo(() => {
    const all = (decisionContext?.trainingSignals?.muscleRecovery ?? []).filter(
      (r) => r && typeof r.recoveryScore === "number" && Number.isFinite(r.recoveryScore),
    );

    const keyOf = (m: unknown) =>
      String(m ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

    const priority = ["chest", "back", "legs", "shoulders"];
    const picked: typeof all = [];
    const used = new Set<string>();

    for (const k of priority) {
      const row = all.find((r) => keyOf(r.muscleGroup) === k);
      if (!row) continue;
      const id = keyOf(row.muscleGroup);
      if (used.has(id)) continue;
      used.add(id);
      picked.push(row);
      if (picked.length >= 4) return picked;
    }

    for (const r of all) {
      const id = keyOf(r.muscleGroup);
      if (used.has(id)) continue;
      used.add(id);
      picked.push(r);
      if (picked.length >= 4) break;
    }

    return picked;
  }, [decisionContext]);

  return (
    <div className="min-w-0 space-y-6">
      {/* 1) HERO DECISION CARD */}
      <Card className="relative overflow-hidden !p-0">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/12 via-transparent to-transparent" />
        <div className="relative p-5">
          <p className="text-sm text-neutral-400">{t("recommended_workout_hero")}</p>
          <h2 className="mt-1 text-3xl font-semibold leading-tight tracking-tight text-neutral-50">
            {split}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tag tone="violet">
              {t("ai_confidence")} {result.confidence}%
            </Tag>
            {result.session_type ? <Tag tone="neutral">{sessionPill}</Tag> : null}
            {strategyRow?.value ? (
              <Tag tone="neutral">{translateStrategyValue(strategyRow.value, t)}</Tag>
            ) : null}
            {durationMin != null ? <Tag tone="neutral">{durationMin} min</Tag> : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {fatigueRow?.value ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
                  {t(whyRowLabelKey("fatigue", true))}
                </p>
                <p className="mt-1 text-base font-semibold text-neutral-100">
                  {fatigueRow.value}
                </p>
              </div>
            ) : null}
            {volumeRow?.value ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
                  {t(whyRowLabelKey("volume", true))}
                </p>
                <p className="mt-1 text-base font-semibold text-neutral-100">
                  {volumeRow.value}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* 2) KEY METRICS GRID */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Split" value={split} />
        <MetricCard label="Duration" value={durationMin != null ? `${durationMin} min` : "—"} />
        <MetricCard label="Exercises" value={result.exercises.length} />
        <MetricCard label="Total sets" value={totalSets} />
      </div>

      {/* 3) MUSCLE RECOVERY */}
      {recoveryRows.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title="Muscle recovery" right={<span className="text-xs text-neutral-500">ready · moderate · fatigued</span>} />
          <Card className="space-y-4 !p-5">
            {recoveryRows.map((r) => (
              <div key={r.muscleGroup} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-neutral-200">{r.muscleGroup}</p>
                  <p className="text-sm tabular-nums text-neutral-400">{Math.round(r.recoveryScore)}%</p>
                </div>
                <ProgressBar value={r.recoveryScore} tone={recoveryTone(r.status)} />
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {/* 4) WORKOUT EXERCISES */}
      <section className="space-y-2">
        <SectionHeader
          title={t("exercises")}
          right={<Tag tone="neutral">{result.exercises.length} items</Tag>}
        />
        <div className="space-y-3">
          {result.exercises.map((ex, i) => {
            const baseline = findBaselineForExerciseName(decisionContext?.fatigueSignals ?? null, ex.name);
            const prevLine = formatLastToTodayLine(ex, baseline, t);
            const badge = localizeDecisionLabel(ex.decision_label, ex.decision, locale, t);
            return (
              <ExerciseCard
                key={`${ex.name}-${i}`}
                name={ex.name}
                sets={formatSetsLines(ex)}
                progress={prevLine ? <span>Progress: {prevLine}</span> : undefined}
                decision={badge}
                decisionTone={decisionTone(ex.decision)}
              />
            );
          })}
        </div>
      </section>

      {/* 5) AI INSIGHTS */}
      {result.insights.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title={t("ai_insights")} />
          <div className="space-y-3">
            {result.insights.slice(0, 3).map((ins, idx) => (
              <InsightCard
                key={`${ins.title}-${idx}`}
                tone={insightTone(ins.type)}
                title={ins.title}
                body={ins.text}
                tag={ins.type}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Coach reason (kept minimal + collapsible) */}
      <WhyCallout body={result.reason} t={t} />

      {/* 6) AI DEBUG (collapsible, hidden by default) */}
      {process.env.NODE_ENV === "development" && result.aiDebug ? (
        <AiDebugPanel result={result} />
      ) : null}

      {/* Warnings */}
      {result.warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-5">
          <p className="text-sm font-semibold text-amber-200/95">{t("warnings")}</p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-amber-200/80">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.exercises.length > 0 ? (
        <button
          type="button"
          onClick={onStart}
          className="w-full min-h-12 rounded-2xl bg-purple-600 py-3.5 text-center text-base font-semibold text-white transition hover:bg-purple-500 active:opacity-90"
        >
          {t("start_workout")}
        </button>
      ) : null}
    </div>
  );
}

function AiDebugPanel({ result }: { result: SuggestNextWorkoutResponse }) {
  const [open, setOpen] = useState(false);
  const dbg = result.aiDebug!;
  return (
    <section
      className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900"
      data-testid="ai-coach-debug"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-200">AI debug</p>
          <p className="mt-0.5 text-xs text-neutral-500">Developer details (hidden by default)</p>
        </div>
        <span className="shrink-0 text-xs text-neutral-500" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      <div
        className={
          "overflow-hidden transition-[max-height] duration-300 ease-out " +
          (open ? "max-h-[620px] border-t border-neutral-800/80" : "max-h-0")
        }
      >
        <div className="space-y-2.5 p-5 text-xs leading-relaxed text-neutral-300">
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Last workout</span>
            <span className="text-right font-medium text-neutral-100">{dbg.lastWorkoutTitle}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Detected split</span>
            <span className="text-right font-medium text-neutral-100">{dbg.lastWorkoutSplit}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Preferred splits</span>
            <span className="text-right font-medium text-neutral-100">
              {dbg.preferredNextSplits.join(" · ") || "—"}
            </span>
          </div>
          {dbg.splitSelection ? (
            <div className="space-y-2 border-t border-neutral-800/80 pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-neutral-500">Candidate scores</span>
                <span className="text-right font-medium text-neutral-100">
                  {dbg.splitSelection.candidates
                    .map((c) => `${c.split} ${c.score}`)
                    .join(" · ") || "—"}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-neutral-500">Reason</p>
                <p className="text-neutral-300">{dbg.splitSelection.reason || "—"}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
