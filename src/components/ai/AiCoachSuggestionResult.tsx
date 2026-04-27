"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { findBaselineForExerciseName } from "@/lib/aiCoachResponseNormalize";
import {
  buildWhyRowsFromTrainingSignalsResponse,
  findExerciseLoadDebugRow,
  formatLastTimeFromBaseline,
  formatLastToTodayLine,
  loadSourceMessageKey,
} from "@/lib/aiCoachDisplay";
import { localizeDecisionLabel } from "@/lib/aiCoachResultLabels";
import type { AiDecisionContext, ExerciseDecision, SuggestNextWorkoutAiExercise, SuggestNextWorkoutResponse } from "@/types/aiCoach";
import type { Exercise } from "@/types/trainingDiary";
import type { MessageKey } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LocaleContext";
import { Card } from "@/components/ui/Card";
// import type { ProgressTone } from "@/components/ui/ProgressBar";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ExerciseCard } from "@/components/ui/ExerciseCard";
import { InsightCard } from "@/components/ui/InsightCard";
import { validateAiCoachSuggestion } from "@/lib/aiCoachQualityCheck";
import { buildAutoProgressionHint, parseExerciseScheme } from "@/lib/aiCoachProgressionHints";

type T = (k: MessageKey) => string;

function splitExerciseName(raw: string): { title: string; equipment: string | null } {
  const s = (raw ?? "").trim();
  const m = s.match(/^(.*?)\s*\(([^)]{2,})\)\s*$/);
  if (!m) return { title: s, equipment: null };
  const title = (m[1] ?? "").trim() || s;
  const equipment = (m[2] ?? "").trim() || null;
  return { title, equipment };
}

function formatSetsChained(ex: SuggestNextWorkoutAiExercise): string {
  if (!ex.sets.length) return "—";
  const norm = ex.sets.map((s) => ({
    w: Math.round(s.weight * 100) / 100,
    r: Math.round(s.reps),
  }));
  const same =
    norm.length > 1 && norm.every((x) => x.w === norm[0]!.w && x.r === norm[0]!.r);
  if (same) {
    return `${norm[0]!.w}×${norm[0]!.r} ×${norm.length}`;
  }
  // Avoid dot-separated set lists; use a slash separator.
  return norm.map((s) => `${s.w}×${s.r}`).join(" / ");
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

// (Tone helpers kept for future full analytics variant)

function WhyCallout({
  body,
  t,
  compact = false,
}: {
  body: string;
  t: T;
  compact?: boolean;
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
            (!open && long ? (compact ? "line-clamp-2" : "line-clamp-3") : "")
          }
        >
          {text}
        </p>
        {long && !compact ? (
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
  /** Dexie catalog snapshot; used for dev quality-check (metadata-based). */
  exerciseCatalog?: Exercise[];
  onStart: () => void;
  /** UI-only: compact/action-first rendering (e.g. Workout screen). */
  variant?: "full" | "compact";
};

function fatigueChipLabel(v: string): "Low" | "Medium" | "High" | "Unknown" {
  const s = v.toLowerCase();
  if (s.includes("low")) return "Low";
  if (s.includes("moderate") || s.includes("medium")) return "Medium";
  if (s.includes("high")) return "High";
  return "Unknown";
}

function volumeChipLabel(v: string): "Low" | "Optimal" | "High" | "Unknown" {
  // We only have a trend label in the current model output; map it to a compact “volume state”.
  // down → low, flat/stable → optimal, up → high.
  const s = v.toLowerCase();
  if (s.includes("down")) return "Low";
  if (s.includes("flat") || s.includes("stable")) return "Optimal";
  if (s.includes("up")) return "High";
  return "Unknown";
}

function localizeDecisionBadgeCompact(label: string, locale: string): string {
  if (locale !== "ru") return label;
  return label
    .replace(/Increase reps/gi, "+ повторения")
    .replace(/Reduce sets?/gi, "− подход")
    .replace(/Maintain sets?/gi, "держать подходы")
    .replace(/Maintain (load|weight)/gi, "держать вес")
    .replace(/Add calf work/gi, "+ подходы для икр");
}

function normalizeRecommendationRu(ex: SuggestNextWorkoutAiExercise): string {
  const name = (ex.name ?? "").toLowerCase();
  const raw = (ex.decision_label ?? "").toLowerCase();

  if (ex.decision === "maintain") return "Стабильная нагрузка";
  if (name.includes("calf") || name.includes("икр")) {
    if (raw.includes("set") || raw.includes("volume")) return "+ подходы для икр";
  }

  if (ex.decision === "increase") {
    if (raw.includes("set")) return "+1 подход";
    if (raw.includes("kg") || raw.includes("weight") || raw.includes("load")) return "+ вес";
    return "+1 повторение";
  }

  if (ex.decision === "reduce") {
    if (raw.includes("rep")) return "−1 повторение";
    return "−1 подход";
  }

  if (ex.decision === "technique") return "Техника";
  if (ex.decision === "volume") return "+1 подход";
  return "Стабильная нагрузка";
}

type WorkingScheme = { w: number; r: number; n: number };

function extractWorkingSchemeFromBaseline(
  latestSets: { weight: number; reps: number }[],
): WorkingScheme | null {
  if (!latestSets.length) return null;
  const norm = latestSets
    .map((s) => ({
      w: Math.round(Math.max(0, Number(s.weight) || 0) * 100) / 100,
      r: Math.round(Math.max(0, Number(s.reps) || 0)),
    }))
    .filter((s) => s.w > 0 && s.r > 0);
  if (norm.length < 2) return null;

  // Pick the most repeated weight as “working weight”.
  const wCounts = new Map<number, number>();
  for (const s of norm) wCounts.set(s.w, (wCounts.get(s.w) ?? 0) + 1);
  let bestW = 0;
  let bestN = 0;
  for (const [w, n] of wCounts.entries()) {
    if (n > bestN || (n === bestN && w > bestW)) {
      bestW = w;
      bestN = n;
    }
  }
  // Ignore single heavy attempts / ramp sets.
  if (bestN < 2) return null;

  const atW = norm.filter((s) => s.w === bestW);
  const repsCounts = new Map<number, number>();
  for (const s of atW) repsCounts.set(s.r, (repsCounts.get(s.r) ?? 0) + 1);
  let bestR = atW[0]!.r;
  let bestRC = 0;
  for (const [r, c] of repsCounts.entries()) {
    if (c > bestRC) {
      bestRC = c;
      bestR = r;
    }
  }
  return { w: bestW, r: bestR, n: bestN };
}

function extractWorkingSchemeFromPrescription(ex: SuggestNextWorkoutAiExercise): WorkingScheme | null {
  const sets = ex.sets ?? [];
  if (sets.length < 1) return null;
  const norm = sets.map((s) => ({
    w: Math.round(Math.max(0, Number(s.weight) || 0) * 100) / 100,
    r: Math.round(Math.max(0, Number(s.reps) || 0)),
  }));
  const same = norm.every((x) => x.w === norm[0]!.w && x.r === norm[0]!.r);
  if (!same) return null;
  return { w: norm[0]!.w, r: norm[0]!.r, n: norm.length };
}

function formatScheme(s: WorkingScheme): string {
  return `${s.w}×${s.r} ×${s.n}`;
}

function computeComparableHistoryLineRu(
  baseline: { latestSets: { weight: number; reps: number }[] } | null,
  ex: SuggestNextWorkoutAiExercise,
): string | null {
  if (!baseline?.latestSets?.length) return null;
  const prev = extractWorkingSchemeFromBaseline(baseline.latestSets);
  const next = extractWorkingSchemeFromPrescription(ex);
  if (!prev || !next) return null;

  // Only compare like-for-like schemes: same set count and same working weight.
  if (prev.n !== next.n) return null;
  if (prev.w !== next.w) return null;

  // Only show when something actually changed (reps differs).
  if (prev.r === next.r) return null;

  return `Было: ${formatScheme(prev)}`;
}

function capCoachNote(s: string, max = 240): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Human-readable fatigue / volume trend / strategy (single place — avoids duplicating tag chips + card).
 */
function TrainingSignalsDetail({
  trainingSignals,
  locale,
}: {
  trainingSignals: SuggestNextWorkoutResponse["training_signals"];
  locale: string;
}) {
  const isRu = locale === "ru";
  const fatigueRaw = String(trainingSignals.fatigue ?? "unknown");
  const volumeRaw = String(trainingSignals.volume_trend ?? "unknown");
  const strategyRaw = String(trainingSignals.strategy ?? "—");

  const fatigueRu =
    fatigueRaw === "low"
      ? "низкая"
      : fatigueRaw === "moderate"
        ? "умеренная"
        : fatigueRaw === "high"
          ? "высокая"
          : fatigueRaw;

  const volumeRu =
    volumeRaw === "down"
      ? "снижается"
      : volumeRaw === "stable"
        ? "стабильный"
        : volumeRaw === "up"
          ? "растёт"
          : volumeRaw;

  const s = strategyRaw.toLowerCase();
  const strategyRu =
    s.includes("maintain")
      ? "Сохраняем текущий объём"
      : s.includes("increase_reps")
        ? "Постепенно увеличиваем повторения"
        : s.includes("reduce_volume")
          ? "Снижаем объём для восстановления"
          : strategyRaw;

  return (
    <div className="mt-4 space-y-1.5 border-t border-neutral-800/80 pt-4 text-sm text-neutral-200/90">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {isRu ? "Состояние нагрузки" : "Load status"}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-neutral-500">{isRu ? "Усталость" : "Fatigue"}</span>
          <span className="text-right font-medium text-neutral-100">
            {isRu ? fatigueRu : fatigueRaw}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-neutral-500">{isRu ? "Объём" : "Volume trend"}</span>
          <span className="text-right font-medium text-neutral-100">
            {isRu ? volumeRu : volumeRaw}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-neutral-500">{isRu ? "Стратегия" : "Strategy"}</span>
          <span className="text-right font-medium text-neutral-100">
            {isRu ? strategyRu : strategyRaw}
          </span>
        </div>
      </div>
    </div>
  );
}

function reasonToBullets(text: string, max = 3): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = lines.length >= 2 ? lines : raw.split(/(?<=[.!?])\s+/g);
  const bullets = base
    .map((s) => s.replace(/^[•\-–]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
  return bullets.length ? bullets : [raw];
}

type DerivedInsight = { title: string; body: string };

function inferPrimaryMuscleBucket(name: string): "back" | "chest" | "legs" | "shoulders" | "arms" | "calves" | "other" {
  const s = (name ?? "").toLowerCase();
  if (/calf/.test(s)) return "calves";
  if (/row|pulldown|pull[-\s]?up|lat|deadlift|back/.test(s)) return "back";
  if (/bench|press|fly|chest/.test(s)) return "chest";
  if (/squat|leg|lunge|quad|ham|string|rdl/.test(s)) return "legs";
  if (/shoulder|ohp|overhead|raise|delt/.test(s)) return "shoulders";
  if (/curl|tricep|bicep|arm/.test(s)) return "arms";
  return "other";
}

function inferChangeType(ex: SuggestNextWorkoutAiExercise): "none" | "increase_sets" | "increase_reps" | "increase_weight" | "reduce_sets" | "reduce_reps" {
  if (ex.decision === "maintain") return "none";
  const raw = (ex.decision_label ?? "").toLowerCase();
  if (ex.decision === "increase") {
    if (raw.includes("set")) return "increase_sets";
    if (raw.includes("kg") || raw.includes("weight") || raw.includes("load")) return "increase_weight";
    return "increase_reps";
  }
  if (ex.decision === "reduce") {
    if (raw.includes("rep")) return "reduce_reps";
    return "reduce_sets";
  }
  if (ex.decision === "volume") return "increase_sets";
  return "none";
}

function adaptiveProgressionLabel(
  ex: Pick<SuggestNextWorkoutAiExercise, "decision" | "decision_label">,
  locale: string,
): string | null {
  const isRu = locale === "ru";
  const decision = String(ex.decision ?? "").toLowerCase();
  const raw = String(ex.decision_label ?? "").toLowerCase();
  const hay = `${decision} ${raw}`;

  if (hay.includes("+1 rep") || hay.includes("increase_reps")) {
    return isRu ? "Цель: +1 повтор" : "Target: +1 rep";
  }
  if (hay.includes("maintain weight")) {
    return isRu ? "Вес без изменений" : "Weight unchanged";
  }
  if (hay.includes("increase weight") || hay.includes("increase_weight")) {
    return isRu ? "Повысить вес дальше" : "Increase weight next";
  }
  if (hay.includes("reduce")) {
    return isRu ? "Снизить нагрузку" : "Reduce load";
  }
  if (hay.includes("maintain")) {
    return isRu ? "Держим нагрузку" : "Maintain";
  }
  return null;
}

function deriveInsightsFromDecisions(
  exercises: SuggestNextWorkoutAiExercise[],
  locale: string,
): DerivedInsight[] {
  const isRu = locale === "ru";
  const byMuscle = new Map<string, { inc: number; dec: number }>();
  for (const ex of exercises) {
    const change = inferChangeType(ex);
    if (change === "none") continue;
    const muscle = inferPrimaryMuscleBucket(ex.name);
    if (muscle === "other") continue;
    const cur = byMuscle.get(muscle) ?? { inc: 0, dec: 0 };
    if (change.startsWith("increase")) cur.inc += 1;
    if (change.startsWith("reduce")) cur.dec += 1;
    byMuscle.set(muscle, cur);
  }

  const insights: DerivedInsight[] = [];
  const add = (titleRu: string, bodyRu: string, titleEn: string, bodyEn: string) => {
    insights.push({
      title: isRu ? titleRu : titleEn,
      body: isRu ? bodyRu : bodyEn,
    });
  };

  const muscleLabelRu: Record<string, string> = {
    back: "спины",
    chest: "груди",
    legs: "ног",
    shoulders: "плеч",
    arms: "рук",
    calves: "икр",
  };

  for (const [muscle, v] of byMuscle.entries()) {
    if (v.inc > 0) {
      add(
        `Увеличиваем объём ${muscleLabelRu[muscle] ?? ""}`.trim(),
        "Есть ресурсы для прогресса — добавляем стимул.",
        `Increasing ${muscle}`,
        "Adding stimulus where recovery allows.",
      );
    } else if (v.dec > 0) {
      add(
        `Снижаем нагрузку на ${muscleLabelRu[muscle] ? muscleLabelRu[muscle].replace(/ы$/, "ы") : "мышцы"}`,
        "Усталость выше нормы — разгружаем.",
        `Reducing ${muscle}`,
        "Backing off due to fatigue.",
      );
    }
  }

  return insights.slice(0, 2);
}

export function AiCoachSuggestionResult({
  result,
  decisionContext,
  exerciseCatalog,
  onStart,
  variant = "full",
}: Props) {
  const { t, locale } = useI18n();
  const rows = buildWhyRowsFromTrainingSignalsResponse(result.training_signals, t);
  const split = (result.training_signals?.split ?? "").trim() || result.title.trim() || t("suggested_workout");
  const fatigueRow = rows.find((r) => r.kind === "fatigue");
  const volumeRow = rows.find((r) => r.kind === "volume");
  const fatigueChip = fatigueRow?.value ? fatigueChipLabel(fatigueRow.value) : "Unknown";
  const volumeChip = volumeRow?.value ? volumeChipLabel(volumeRow.value) : "Unknown";

  const sessionTypeLine = (result.session_type ?? "").trim();
  const confidencePct =
    typeof result.confidence === "number" && Number.isFinite(result.confidence)
      ? Math.max(0, Math.min(100, Math.round(result.confidence)))
      : null;
  const loadSignalsUnknown = fatigueChip === "Unknown" || volumeChip === "Unknown";

  const ui = useMemo(() => {
    const isRu = locale === "ru";
    return {
      isRu,
      recommendedWorkout: isRu ? "Сегодня тренируем" : "Today we train",
      exercisesWord: isRu ? "упр." : "exercises",
      insightType: (k: string) => {
        if (!isRu) return k;
        if (k === "opportunity") return "возможность";
        if (k === "balance") return "баланс";
        if (k === "fatigue") return "усталость";
        if (k === "progress") return "прогресс";
        if (k === "risk") return "риск";
        return k;
      },
      startWorkout: isRu ? "Подготовить тренировку" : "Prepare workout",
      confidenceLabel: isRu ? "Уверенность" : "Confidence",
      calibrationMessage: isRu
        ? "Калибровочная тренировка: подбери веса примерно под RPE 7. Так план нагрузки станет точнее."
        : "This is your calibration workout. Adjust loads to about RPE 7 so we can plan your training more accurately.",
    };
  }, [locale]);

  const derivedInsights = useMemo(() => {
    if (result.insights?.length) {
      return result.insights.slice(0, 2).map((i) => ({
        title: i.title,
        body: i.text,
      }));
    }
    return deriveInsightsFromDecisions(result.exercises, locale);
  }, [result.insights, result.exercises, locale]);

  const displayReason = useMemo(() => {
    const isCoachSkeleton = result.aiDebug?.generationSource === "coach_skeleton";
    if (!isCoachSkeleton) return result.reason;
    return locale === "ru"
      ? "Структурированная стартовая тренировка с простой прогрессией в основных упражнениях."
      : "Structured starter session with simple progression on key lifts.";
  }, [result.aiDebug?.generationSource, result.reason, locale]);

  const displayWhyText = useMemo(() => {
    // Keep the backend reason intact, but avoid overly technical lifecycle phrasing when it matches
    // our known onboarding-style template sentence.
    const raw = displayReason.trim();
    if (!raw) return raw;
    const isRu = locale === "ru";
    if (!isRu) {
      if (/starting cycle week\s*1/i.test(raw) && /full\s*body/i.test(raw)) {
        return (
          "Starting a new training cycle with a balanced full-body session.\n" +
          "Your weekly volume is still low, so this workout focuses on building a strong base."
        );
      }
      return raw;
    }
    if (/начинаем новый тренировочный цикл/i.test(raw) && /(всё тело|на всё тело)/i.test(raw)) {
      return (
        "Начинаем новый тренировочный цикл со сбалансированной тренировки на всё тело.\n" +
        "Недельный объём пока низкий, поэтому тренировка направлена на создание базы."
      );
    }
    return raw;
  }, [displayReason, locale]);

  const isBaselineMode = useMemo(() => {
    const ts = result.training_signals;
    const fatigueUnknown = String(ts?.fatigue ?? "unknown").toLowerCase() === "unknown";
    const volumeUnknown = String(ts?.volume_trend ?? "unknown").toLowerCase() === "unknown";
    if (fatigueUnknown || volumeUnknown) return true;

    const recoveryRows = result.recoverySummary ?? [];
    const volumeRows = result.volumeSummary ?? [];

    const recoveryAllReadyOrUnknown =
      recoveryRows.length > 0 &&
      recoveryRows.every((r) => r.status === "ready" || r.status === "unknown" || !r.status);

    const volumeAllLowWithZeroSets =
      volumeRows.length > 0 &&
      volumeRows.every((r) => {
        const stOk = r.status === "low" || r.status === "unknown" || !r.status;
        const sets = typeof r.sets === "number" && Number.isFinite(r.sets) ? r.sets : null;
        return stOk && (sets === null || sets === 0);
      });

    return recoveryAllReadyOrUnknown && volumeAllLowWithZeroSets;
  }, [result.training_signals, result.recoverySummary, result.volumeSummary]);

  const showCalibrationBanner = useMemo(
    () => isBaselineMode || result.aiDebug?.strengthCalibrationUsed === true,
    [isBaselineMode, result.aiDebug?.strengthCalibrationUsed],
  );

  const splitReasonLine = useMemo(() => {
    const raw = result.aiDebug?.splitSelection?.reason?.trim();
    if (raw) return raw;
    return t("split_selection_reason_fallback");
  }, [result.aiDebug?.splitSelection?.reason, t]);

  // Recovery moved out of the Workout recommendation card.

  return (
    <div className="min-w-0 space-y-6">
      {/* Compact recommendation header */}
      <Card className="relative overflow-hidden !p-0">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/12 via-transparent to-transparent" />
        <div className="relative p-5">
          <p className="text-sm text-neutral-400">{ui.recommendedWorkout}</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-neutral-50 sm:text-3xl">
            {split}
          </h2>
          {splitReasonLine ? (
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
              {splitReasonLine}
            </p>
          ) : null}
          {sessionTypeLine ? (
            <p className="mt-2 line-clamp-2 text-sm text-violet-200/85">{sessionTypeLine}</p>
          ) : null}
          {confidencePct != null ? (
            <p className="mt-1.5 text-xs text-neutral-500">
              {ui.confidenceLabel}{" "}
              <span className="font-medium text-neutral-300/90">{confidencePct}%</span>
            </p>
          ) : null}
          <p className="mt-3 text-sm text-neutral-500">
            {result.exercises.length} {ui.exercisesWord}
          </p>
          {showCalibrationBanner && !loadSignalsUnknown ? (
            <div
              className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-2.5 text-sm leading-snug text-amber-50/95"
              role="status"
            >
              {ui.calibrationMessage}
            </div>
          ) : null}
          {loadSignalsUnknown ? (
            <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {locale === "ru" ? "Состояние нагрузки" : "Load status"}
              </p>
              <p className="mt-1 text-base font-semibold text-neutral-100">
                {locale === "ru" ? "Базовая тренировка" : "Baseline session"}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {locale === "ru"
                  ? "Собираем данные тренировок, чтобы персонализировать план."
                  : "We are collecting training data to personalize your plan."}
              </p>
              {showCalibrationBanner ? (
                <p className="mt-3 border-t border-neutral-800/80 pt-3 text-sm leading-snug text-neutral-300/90">
                  {ui.calibrationMessage}
                </p>
              ) : null}
            </div>
          ) : result.training_signals ? (
            <TrainingSignalsDetail
              trainingSignals={result.training_signals}
              locale={locale}
            />
          ) : null}
        </div>
      </Card>

      {result.exercises.length > 0 ? (
        <button
          type="button"
          onClick={onStart}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-950/30 ring-1 ring-inset ring-white/10 transition hover:bg-purple-500 active:opacity-90"
        >
          <Play className="h-5 w-5 shrink-0" aria-hidden />
          {ui.startWorkout}
        </button>
      ) : null}

      {/* Recovery summary (user-facing) */}
      {!isBaselineMode
        ? (() => {
            const rows = result.recoverySummary ?? [];
            const hasUseful = rows.some((r) => r.status && r.status !== "unknown");
            const isRu = locale === "ru";
            if (!rows.length || !hasUseful) {
              return (
                <section className="space-y-2">
                  <SectionHeader title={isRu ? "Восстановление" : "Recovery"} />
                  <Card className="!p-5">
                    <p className="text-base font-semibold text-neutral-100">
                      {isRu ? "Собираем данные восстановления" : "Learning your recovery"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {isRu
                        ? "Показатели восстановления появятся после нескольких завершённых тренировок."
                        : "Recovery insights will appear after a few completed workouts."}
                    </p>
                  </Card>
                </section>
              );
            }
            return (
              <section className="space-y-2">
                <SectionHeader title={locale === "ru" ? "Восстановление" : "Recovery"} />
                <Card className="!p-5">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {rows.map((r, idx) => {
                const muscleKey = String(r.muscle);
                const muscleLabel =
                  muscleKey === "chest"
                    ? isRu
                      ? "Грудь"
                      : "Chest"
                    : muscleKey === "back"
                      ? isRu
                        ? "Спина"
                        : "Back"
                      : muscleKey === "shoulders"
                        ? isRu
                          ? "Плечи"
                          : "Shoulders"
                        : muscleKey === "legs"
                          ? isRu
                            ? "Ноги"
                            : "Legs"
                          : muscleKey === "biceps"
                            ? isRu
                              ? "Бицепс"
                              : "Biceps"
                            : muscleKey === "triceps"
                              ? isRu
                                ? "Трицепс"
                                : "Triceps"
                              : muscleKey === "core"
                                ? isRu
                                  ? "Кор"
                                  : "Core"
                                : muscleKey;
                const status =
                  r.status === "ready" ||
                  r.status === "recovering" ||
                  r.status === "fatigued" ||
                  r.status === "unknown"
                    ? r.status
                    : "unknown";
                const statusLabel =
                  status === "ready"
                    ? isRu
                      ? "готово"
                      : "Ready"
                    : status === "recovering"
                      ? isRu
                        ? "восстанавливается"
                        : "Recovering"
                      : status === "fatigued"
                        ? isRu
                          ? "утомлено"
                          : "Fatigued"
                        : isRu
                          ? "нет данных"
                          : "No data";
                const dot =
                  status === "ready"
                    ? "bg-emerald-400"
                    : status === "recovering"
                      ? "bg-amber-400"
                      : status === "fatigued"
                        ? "bg-rose-400"
                        : "bg-neutral-500";
                return (
                  <div
                    key={muscleKey}
                    className={
                      "flex min-w-0 items-center justify-between gap-2 " +
                      (rows.length % 2 === 1 && idx === rows.length - 1 ? "col-span-2" : "")
                    }
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-neutral-200">
                      {muscleLabel}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm text-neutral-400">
                      <span className={"h-2.5 w-2.5 rounded-full " + dot} aria-hidden />
                      <span className="whitespace-nowrap">{statusLabel}</span>
                    </span>
                  </div>
                );
                    })}
                  </div>
                </Card>
              </section>
            );
          })()
        : null}

      {/* Weekly volume summary (user-facing) */}
      {!isBaselineMode
        ? (() => {
            const rows = result.volumeSummary ?? [];
            const useful = rows.length > 0 && rows.some((r) => r.status && r.status !== "unknown");
            if (!useful) return null;
            const isRu = locale === "ru";
            return (
              <section className="space-y-2">
                <SectionHeader title={isRu ? "Недельный объём" : "Weekly volume"} />
                <Card className="!p-5">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {rows.map((r, idx) => {
                  const muscleKey = String(r.muscle);
                  const muscleLabel =
                    muscleKey === "chest"
                      ? isRu
                        ? "Грудь"
                        : "Chest"
                      : muscleKey === "back"
                        ? isRu
                          ? "Спина"
                          : "Back"
                        : muscleKey === "shoulders"
                          ? isRu
                            ? "Плечи"
                            : "Shoulders"
                          : muscleKey === "legs"
                            ? isRu
                              ? "Ноги"
                              : "Legs"
                            : muscleKey === "biceps"
                              ? isRu
                                ? "Бицепс"
                                : "Biceps"
                              : muscleKey === "triceps"
                                ? isRu
                                  ? "Трицепс"
                                  : "Triceps"
                                : muscleKey === "core"
                                  ? isRu
                                    ? "Кор"
                                    : "Core"
                                  : muscleKey;
                  const status =
                    r.status === "low" ||
                    r.status === "optimal" ||
                    r.status === "high" ||
                    r.status === "unknown"
                      ? r.status
                      : "unknown";
                  const statusLabel =
                    status === "low"
                      ? isRu
                        ? "Низкий объём"
                        : "Low volume"
                      : status === "optimal"
                        ? isRu
                          ? "Нормальный объём"
                          : "Optimal volume"
                        : status === "high"
                          ? isRu
                            ? "Высокий объём"
                            : "High volume"
                          : isRu
                            ? "Нет данных"
                            : "No data";
                  const dot =
                    status === "low"
                      ? "bg-violet-400"
                      : status === "optimal"
                        ? "bg-emerald-400"
                        : status === "high"
                          ? "bg-amber-400"
                          : "bg-neutral-500";
                  const sets =
                    typeof r.sets === "number" && Number.isFinite(r.sets) ? r.sets : null;
                  const setsLine =
                    sets === null
                      ? null
                      : isRu
                        ? `${sets} подходов за неделю`
                        : `${sets} sets this week`;
                  return (
                    <div
                      key={muscleKey}
                      className={
                        "flex min-w-0 items-center justify-between gap-2 " +
                        (rows.length % 2 === 1 && idx === rows.length - 1 ? "col-span-2" : "")
                      }
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-neutral-200">
                        {muscleLabel}
                      </span>
                      <span className="flex shrink-0 items-start gap-2 text-right">
                        <span className={"mt-1 h-2.5 w-2.5 rounded-full " + dot} aria-hidden />
                        <span className="min-w-0">
                          <span className="block whitespace-nowrap text-sm font-medium text-neutral-200">
                            {statusLabel}
                          </span>
                          {setsLine ? (
                            <span className="block whitespace-nowrap text-xs text-neutral-500">
                              {setsLine}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  );
                    })}
                  </div>
                </Card>
              </section>
            );
          })()
        : null}

      {/* Insights ABOVE exercises (matches Workout screen flow) */}
      {derivedInsights.length > 0 ? (
        <section className="space-y-2">
          <SectionHeader title={locale === "ru" ? "Инсайты ИИ" : "AI insights"} />
          <div className="space-y-3">
            {derivedInsights.map((ins, idx) => (
              <InsightCard
                key={`${ins.title}-${idx}`}
                tone="violet"
                title={ins.title}
                body={ins.body}
                compact={variant === "compact"}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Exercises */}
      <section className="space-y-2">
        <SectionHeader
          title={t("exercises")}
          right={<Tag tone="neutral">{result.exercises.length} items</Tag>}
        />
        <div className="space-y-3">
          {result.exercises.map((ex, i) => {
            const fatigue = decisionContext?.fatigueSignals ?? null;
            const hasExerciseBaselines =
              (fatigue?.exerciseBaselines?.length ?? 0) > 0;
            const baseline = findBaselineForExerciseName(fatigue, ex.name);
            const lastTimeLine =
              hasExerciseBaselines && baseline
                ? formatLastTimeFromBaseline(baseline, ex, t)
                : null;
            const loadDebug = findExerciseLoadDebugRow(
              result.aiDebug?.exerciseLoadDebug,
              ex.name,
            );
            const loadSourceLine = loadDebug ? t(loadSourceMessageKey(loadDebug.source)) : null;
            const prevLine = formatLastToTodayLine(ex, baseline, t);
            const fallbackBadge =
              locale === "ru"
                ? normalizeRecommendationRu(ex)
                : localizeDecisionBadgeCompact(
                    localizeDecisionLabel(ex.decision_label, ex.decision, locale, t),
                    locale,
                  );
            const badge = adaptiveProgressionLabel(ex, locale) ?? fallbackBadge;
            const historyLineRu =
              variant === "compact" && locale === "ru" && ex.decision !== "maintain"
                ? computeComparableHistoryLineRu(baseline, ex)
                : null;
            const showPrev = variant === "compact" ? Boolean(historyLineRu) : Boolean(prevLine);
            const { title, equipment } = splitExerciseName(ex.name);
            const setsChained = formatSetsChained(ex);
            const scheme = parseExerciseScheme(setsChained);
            const autoHint =
              scheme && variant === "compact"
                ? buildAutoProgressionHint({ ex, scheme, locale })
                : null;
            const reasonNote = ex.reason?.trim() ? capCoachNote(ex.reason) : null;
            return (
              <ExerciseCard
                key={`${ex.name}-${i}`}
                name={
                  variant === "compact" && equipment ? (
                    <span className="block">
                      <span className="block">{title}</span>
                      <span className="mt-0.5 block text-xs font-normal text-neutral-500">
                        {equipment}
                      </span>
                    </span>
                  ) : (
                    title
                  )
                }
                sets={variant === "compact" ? setsChained : formatSetsLines(ex)}
                recommendation={
                  variant === "compact" ? (
                    <span className="block">
                      <span className="block">{badge}</span>
                      {autoHint ? (
                        <span className="mt-0.5 block text-[12px] font-medium text-neutral-200/60">
                          {autoHint}
                        </span>
                      ) : null}
                    </span>
                  ) : undefined
                }
                coachNote={reasonNote ?? undefined}
                lastTimeLine={lastTimeLine ?? undefined}
                loadSourceLine={loadSourceLine ?? undefined}
                progress={
                  showPrev ? (
                    <span className="text-neutral-500">
                      {variant === "compact" && locale === "ru"
                        ? historyLineRu
                        : prevLine}
                    </span>
                  ) : undefined
                }
                decision={variant === "compact" ? undefined : badge}
                decisionTone={decisionTone(ex.decision)}
                compact={variant === "compact"}
                showDecisionBadge={variant !== "compact"}
              />
            );
          })}
        </div>
      </section>

      {/* Coach reason */}
      {variant === "compact" ? (
        <section className="space-y-2">
          <SectionHeader title={ui.isRu ? "Почему так" : t("why_this_workout")} />
          <Card className="!p-5">
            <ul className="space-y-2 text-sm leading-relaxed text-neutral-200/90">
              {reasonToBullets(displayWhyText, 3).map((b, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="mt-[2px] text-neutral-500" aria-hidden>
                    •
                  </span>
                  <span className="min-w-0">{b}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : (
        <WhyCallout body={displayWhyText} t={t} compact={false} />
      )}

      {/* 6) AI DEBUG (collapsible, hidden by default) */}
      {process.env.NODE_ENV === "development" && result.aiDebug ? (
        <AiDebugPanel
          result={result}
          decisionContext={decisionContext}
          exerciseCatalog={exerciseCatalog}
        />
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

    </div>
  );
}

function AiDebugPanel({
  result,
  decisionContext,
  exerciseCatalog,
}: {
  result: SuggestNextWorkoutResponse;
  decisionContext: AiDecisionContext | null;
  exerciseCatalog?: Exercise[];
}) {
  const [open, setOpen] = useState(false);
  const dbg = result.aiDebug!;
  const trace = dbg.decisionTrace ?? null;
  const traceGroups = useMemo(() => {
    const entries = trace?.entries ?? [];
    const allow = new Set([
      "ExerciseSelectionEngine",
      "TrainingAdaptationEngine",
      "LoadManagementEngine",
    ]);
    const group: Record<string, typeof entries> = {
      ExerciseSelectionEngine: [],
      TrainingAdaptationEngine: [],
      LoadManagementEngine: [],
    };
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const eng = (e as { engine?: string }).engine ?? "";
      if (!allow.has(eng)) continue;
      group[eng]!.push(e);
    }
    return group;
  }, [trace]);
  const qc = useMemo(
    () => validateAiCoachSuggestion(result, decisionContext, exerciseCatalog),
    [result, decisionContext, exerciseCatalog],
  );
  return (
    <section
      className="mt-8 overflow-hidden rounded-2xl border border-dashed border-neutral-700/50 bg-neutral-950/40"
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
          {qc.warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
              <p className="font-semibold text-amber-200/95">Quality check</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-amber-200/80">
                {qc.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">Quality check: passed</p>
          )}

          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Last workout</span>
            <span className="text-right font-medium text-neutral-100">{dbg.lastWorkoutTitle}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Mode</span>
            <span className="text-right font-medium text-neutral-100">{dbg.mode ?? "—"}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Generation source</span>
            <span className="text-right font-medium text-neutral-100">
              {dbg.generationSource ?? "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Insight source</span>
            <span className="text-right font-medium text-neutral-100">
              {dbg.insightSource ?? "—"}
            </span>
          </div>

          <div className="space-y-2 border-t border-neutral-800/80 pt-3">
            <p className="text-neutral-500">Strength calibration</p>
            <div className="flex items-start justify-between gap-3">
              <span className="text-neutral-500">Used</span>
              <span className="text-right font-medium text-neutral-100">
                {dbg.strengthCalibrationUsed ? "true" : "false"}
              </span>
            </div>
            {dbg.strengthCalibrationDebug ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-neutral-500">Payload has calibration</span>
                  <span className="text-right font-medium text-neutral-100">
                    {dbg.strengthCalibrationDebug.payloadHasStrengthCalibration ? "true" : "false"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-neutral-500">DecisionContext has calibration</span>
                  <span className="text-right font-medium text-neutral-100">
                    {dbg.strengthCalibrationDebug.decisionContextHasStrengthCalibration ? "true" : "false"}
                  </span>
                </div>
              </>
            ) : null}
            {dbg.calibratedExercises && dbg.calibratedExercises.length > 0 ? (
              <div className="space-y-1">
                <p className="text-neutral-500">Calibrated exercises</p>
                <ul className="list-inside list-disc text-neutral-300">
                  {dbg.calibratedExercises.slice(0, 12).map((c) => (
                    <li key={`${c.exercise}-${c.sourceLift}`}>
                      {c.exercise}: {c.estimatedWeight}kg ({c.sourceLift})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {dbg.exerciseLoadDebug && dbg.exerciseLoadDebug.length > 0 ? (
              <div className="space-y-1">
                <p className="text-neutral-500">Load source (per exercise)</p>
                <ul className="space-y-1">
                  {dbg.exerciseLoadDebug.slice(0, 12).map((row) => (
                    <li
                      key={row.exercise}
                      className="rounded-xl border border-neutral-800/80 bg-neutral-950/30 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium text-neutral-100">{row.exercise}</span>
                        <span className="text-neutral-400">{row.source}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-neutral-400">
                        <span>programmed: {row.programmedLoad ?? "—"}</span>
                        <span>calib: {row.calibrationWeight ?? "—"}</span>
                        <span>final: {row.finalWeight}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {dbg.generationSource === "coach_skeleton" ? (
            <div className="space-y-2 border-t border-neutral-800/80 pt-3">
              <p className="text-neutral-500">Coach mode</p>
              <div className="flex items-start justify-between gap-3">
                <span className="text-neutral-500">Profile applied</span>
                <span className="text-right font-medium text-neutral-100">
                  {dbg.coachModeProfileApplied ? "true" : "false"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-neutral-500">Source</span>
                <span className="text-right font-medium text-neutral-100">
                  {dbg.coachModeSource ?? "—"}
                </span>
              </div>
              {dbg.coachModeReason ? (
                <div className="space-y-1">
                  <p className="text-neutral-500">Reason</p>
                  <p className="text-neutral-300">{dbg.coachModeReason}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {dbg.insightWarnings && dbg.insightWarnings.length > 0 ? (
            <div className="space-y-1 border-t border-neutral-800/80 pt-3">
              <p className="text-neutral-500">Insight warnings</p>
              <ul className="list-inside list-disc text-neutral-300">
                {dbg.insightWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Detected split</span>
            <span className="text-right font-medium text-neutral-100">{dbg.lastWorkoutSplit}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-neutral-500">Preferred splits</span>
            <span className="text-right font-medium text-neutral-100">
              {(dbg.preferredNextSplits ?? []).join(" · ") || "—"}
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

          {trace ? (
            <div className="space-y-2 border-t border-neutral-800/80 pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-neutral-500">Decision trace</span>
                <span className="text-right font-medium text-neutral-100">
                  {trace.traceId}
                </span>
              </div>

              {(
                [
                  "ExerciseSelectionEngine",
                  "TrainingAdaptationEngine",
                  "LoadManagementEngine",
                ] as const
              ).map((engine) => {
                const rows = traceGroups[engine] ?? [];
                if (!rows.length) return null;
                return (
                  <div key={engine} className="space-y-2">
                    <p className="text-neutral-500">{engine}</p>
                    <div className="space-y-2">
                      {rows.slice(0, 40).map((e, idx) => {
                        const o = e as Record<string, unknown>;
                        const entity = String(o.entity ?? "—");
                        const decision = String(o.decision ?? "—");
                        const score = o.score;
                        const reasons = Array.isArray(o.reasons)
                          ? (o.reasons as unknown[]).map((x) => String(x)).filter(Boolean)
                          : [];
                        return (
                          <div
                            key={`${engine}-${idx}-${entity}`}
                            className="rounded-xl border border-neutral-800/80 bg-neutral-950/30 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-neutral-100">
                                {entity}
                              </span>
                              <span className="text-neutral-400">
                                {decision}
                                {typeof score === "number" && Number.isFinite(score)
                                  ? ` · ${Math.round(score)}`
                                  : ""}
                              </span>
                            </div>
                            {reasons.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {reasons.slice(0, 18).map((r) => (
                                  <span
                                    key={r}
                                    className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300"
                                  >
                                    {r}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
