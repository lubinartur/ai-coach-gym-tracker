import type { AppLocale, MessageKey } from "@/i18n/dictionary";
import { normalizeExerciseName } from "@/lib/exerciseName";
import {
  isSessionSetWarmup,
  pickWorkingSetForComparison,
} from "@/lib/exerciseWorkingSets";
import type {
  AiInsightType,
  AiTrainingSignalsResponse,
  ExerciseBaselineForAi,
  ExerciseDecision,
  FatigueSignal,
  SuggestNextWorkoutAiDebug,
  SuggestNextWorkoutAiExercise,
  TrainingSignals,
  VolumeTrend,
} from "@/types/aiCoach";

const MAX_EXPLANATION_CHARS = 150;

export function capExplanation(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_EXPLANATION_CHARS) return t;
  return `${t.slice(0, MAX_EXPLANATION_CHARS - 1).trimEnd()}…`;
}

/** 14px / 1.4 / ~85% contrast (Tailwind: text-sm, /85 alpha). */
export const explanationTextClass = "text-sm leading-[1.4] text-neutral-200/85";

export type WhyRowKind = "split" | "fatigue" | "volume" | "strategy";

export type WhyDisplayRow = {
  kind: WhyRowKind;
  value: string;
  strategyPill?: boolean;
};

type T = (k: MessageKey) => string;

function humanizeVolume(t: T, v: VolumeTrend): string {
  if (v === "up") return t("trend_up");
  if (v === "down") return t("trend_down");
  if (v === "stable") return t("trend_flat");
  return t("trend_unknown");
}

function humanizeFatigue(t: T, f: FatigueSignal): string {
  if (f === "high") return t("fatigue_high");
  if (f === "moderate") return t("fatigue_moderate");
  if (f === "low") return t("fatigue_low");
  return t("fatigue_unknown");
}

/** New API: structured training_signals from the model. */
export function buildWhyRowsFromTrainingSignalsResponse(
  ts: AiTrainingSignalsResponse,
  t: T,
): WhyDisplayRow[] {
  return [
    { kind: "split", value: ts.split },
    { kind: "fatigue", value: humanizeFatigue(t, ts.fatigue) },
    { kind: "volume", value: humanizeVolume(t, ts.volume_trend) },
    { kind: "strategy", value: ts.strategy, strategyPill: true },
  ];
}

/**
 * One signal per line: e.g. Split: Push, Fatigue: Moderate.
 * Renders on the client with `t('split') + ': ' + value` etc. (do not put labels in `value`).
 */
export function buildWhyDisplayRows(
  signals: TrainingSignals,
  nextTitle: string,
  sessionType: string | undefined,
  t: T,
): WhyDisplayRow[] {
  const title = (nextTitle ?? "").trim();
  const pattern = signals.recentSplitPattern.filter(Boolean);
  const splitValue =
    pattern.length > 0
      ? `${pattern.join(" → ")} → ${title || t("next")}`
      : title
        ? title
        : t("em_dash");
  const rows: WhyDisplayRow[] = [
    { kind: "split", value: splitValue },
    { kind: "fatigue", value: humanizeFatigue(t, signals.fatigueSignal) },
    { kind: "volume", value: humanizeVolume(t, signals.volumeTrend) },
  ];
  const st = (sessionType ?? "").trim();
  if (st) {
    rows.push({ kind: "strategy", value: st, strategyPill: true });
  }
  return rows;
}

export function whyRowLabelKey(kind: WhyRowKind, shortVolumeLabel?: boolean): MessageKey {
  switch (kind) {
    case "split":
      return "split";
    case "fatigue":
      return "fatigue";
    case "volume":
      return shortVolumeLabel ? "sig_volume" : "volume_trend";
    case "strategy":
      return "strategy";
  }
}

const EXERCISE_DECISION_CLASS: Record<ExerciseDecision, string> = {
  increase:
    "inline-flex max-w-full rounded-md border border-violet-500/45 bg-violet-500/12 px-1.5 py-0.5 text-violet-100/95",
  maintain:
    "inline-flex max-w-full rounded-md border border-sky-500/45 bg-sky-500/12 px-1.5 py-0.5 text-sky-100/95",
  reduce:
    "inline-flex max-w-full rounded-md border border-amber-500/50 bg-amber-500/12 px-1.5 py-0.5 text-amber-100/90",
  technique:
    "inline-flex max-w-full rounded-md border border-cyan-500/45 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-100/90",
  volume:
    "inline-flex max-w-full rounded-md border border-indigo-500/45 bg-indigo-500/12 px-1.5 py-0.5 text-indigo-100/95",
};

export function suggestNextExerciseBadgeClass(d: ExerciseDecision): string {
  return EXERCISE_DECISION_CLASS[d] ?? EXERCISE_DECISION_CLASS.maintain;
}

export function insightTypeIcon(type: AiInsightType): string {
  switch (type) {
    case "progress":
      return "↑";
    case "fatigue":
      return "⚡";
    case "balance":
      return "⚖";
    case "risk":
      return "!";
    case "opportunity":
      return "✦";
    default:
      return "•";
  }
}

export function insightCardRingClass(t: AiInsightType): string {
  switch (t) {
    case "progress":
      return "border-emerald-500/35 bg-emerald-500/8";
    case "fatigue":
      return "border-amber-500/40 bg-amber-500/6";
    case "balance":
      return "border-sky-500/40 bg-sky-500/6";
    case "risk":
      return "border-red-500/45 bg-red-500/5";
    case "opportunity":
      return "border-fuchsia-500/35 bg-fuchsia-500/5";
    default:
      return "border-neutral-700 bg-neutral-900/60";
  }
}

/** Compact insight row: subtle fill, light border. */
export function insightSubtleRowClass(type: AiInsightType): string {
  switch (type) {
    case "progress":
      return "border border-neutral-800/90 bg-emerald-500/[0.06]";
    case "fatigue":
      return "border border-neutral-800/90 bg-amber-500/[0.06]";
    case "balance":
      return "border border-neutral-800/90 bg-sky-500/[0.05]";
    case "risk":
      return "border border-neutral-800/90 bg-red-500/[0.05]";
    case "opportunity":
      return "border border-neutral-800/90 bg-fuchsia-500/[0.05]";
    default:
      return "border border-neutral-800/90 bg-neutral-900/50";
  }
}

export function decisionToMessageKey(d: ExerciseDecision): MessageKey {
  if (d === "increase") return "decision_increase";
  if (d === "maintain") return "decision_maintain";
  if (d === "reduce") return "decision_reduce";
  if (d === "technique") return "decision_technique";
  return "decision_volume";
}

function formatWeightReps(w: number, r: number): string {
  const wn = Math.round(w * 100) / 100;
  return `${wn}×${r}`;
}

/**
 * One line: “Last time: W×R” from baseline working set (for comparison to today’s first set).
 * Returns null if no comparable history.
 */
export function formatLastTimeFromBaseline(
  baseline: ExerciseBaselineForAi | null,
  ex: SuggestNextWorkoutAiExercise,
  t: T,
): string | null {
  if (!baseline?.latestSets?.length) return null;
  const set = ex.sets[0];
  if (!set) return null;
  const comp = pickWorkingSetForComparison(
    baseline.latestSets.map((s) => ({ weight: s.weight, reps: s.reps })),
    set.weight,
    set.reps,
  );
  if (!comp) return null;
  const wn = Math.round(Math.max(0, comp.weight) * 100) / 100;
  const rn = Math.round(Math.max(0, comp.reps));
  if (!(wn > 0 && rn > 0)) return null;
  return t("exercise_baseline_last_time")
    .replace("{{w}}", String(wn))
    .replace("{{r}}", String(rn));
}

/** “Last: W×R → Today: W×R” from baseline and first target set. */
export function formatLastToTodayLine(
  ex: SuggestNextWorkoutAiExercise,
  baseline: ExerciseBaselineForAi | null,
  t: T,
): string | null {
  const set = ex.sets[0];
  if (!set) return null;
  const today = formatWeightReps(set.weight, set.reps);
  const latest = baseline?.latestSets;
  if (latest && latest.length > 0) {
    const comp = pickWorkingSetForComparison(
      latest.map((s) => ({ weight: s.weight, reps: s.reps })),
      set.weight,
      set.reps,
    );
    if (comp) {
      const last = formatWeightReps(comp.weight, comp.reps);
      return `${t("exercise_last")}: ${last} → ${today}`;
    }
  }
  return null;
}

type ExerciseLoadDebugRow = NonNullable<
  SuggestNextWorkoutAiDebug["exerciseLoadDebug"]
>[number];

export function findExerciseLoadDebugRow(
  rows: SuggestNextWorkoutAiDebug["exerciseLoadDebug"] | undefined,
  exerciseName: string,
): ExerciseLoadDebugRow | null {
  if (!rows?.length) return null;
  const key = normalizeExerciseName(exerciseName);
  for (const r of rows) {
    if (normalizeExerciseName(r.exercise) === key) return r;
  }
  return null;
}

export function loadSourceMessageKey(source: ExerciseLoadDebugRow["source"]): MessageKey {
  switch (source) {
    case "history":
      return "ai_coach_load_source_history";
    case "calibration":
    case "calibration_rpe":
      return "ai_coach_load_source_calibration";
    case "llm":
      return "ai_coach_load_source_plan";
    case "fallback":
    default:
      return "ai_coach_load_source_fallback";
  }
}

export type DecisionKind = "progress" | "maintain" | "volume" | "deload";

const DECISION_PATTERNS: { kind: DecisionKind; re: RegExp }[] = [
  { kind: "deload", re: /\b(deload|de-?load|easer?\s*week|easier\s+week|reduced?\s*load|recovery\s*week|take\s*it\s*easy)\b/i },
  { kind: "maintain", re: /\b(maintain(ing)?\s*weight|hold(ing)?\s*weight|same\s*weight|keep\s*weight|no\s*progression)\b/i },
  { kind: "volume", re: /\bvolume\s*focus|more\s*sets|higher?\s*volume|accumulation\b/i },
  { kind: "progress", re: /[+]\s*\d+|\d+\s*%\s*(increase|more)|progression|increase(d)?\s*weight|add\s*weight|heavier|bump(ing)?/i },
];

function detectDecisionKind(text: string): DecisionKind {
  for (const { kind, re } of DECISION_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return "progress";
}

const badgeClass: Record<DecisionKind, string> = {
  progress: "inline-flex max-w-full rounded-md border border-violet-500/40 bg-violet-500/15 px-1.5 py-0.5 text-violet-200",
  maintain: "inline-flex max-w-full rounded-md border border-sky-500/40 bg-sky-500/15 px-1.5 py-0.5 text-sky-200",
  volume: "inline-flex max-w-full rounded-md border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 text-blue-200",
  deload: "inline-flex max-w-full rounded-md border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-amber-200",
};

export function decisionBadgeClass(kind: DecisionKind): string {
  return badgeClass[kind];
}

function formatKgProgression(kg: string, locale: AppLocale, t: T): string {
  if (locale === "ru") {
    return `+${kg.replace(".", ",")}кг, ${t("progression")}`;
  }
  return `+${kg}kg ${t("progression")}`;
}

function formatPctProgression(pct: string, locale: AppLocale, t: T): string {
  if (locale === "ru") {
    return `+${pct.replace(".", ",")}% ${t("progression")}`;
  }
  return `+${pct}% ${t("progression")}`;
}

export type ParseExerciseReasonOptions = {
  /** Logged sets from the last session for this exercise. Used to fix AI citing a warm-up set. */
  latestSessionSets?: { weight: number; reps: number }[];
  /** First suggested set; together with `latestSessionSets` selects a working comparison. */
  suggestedFirstSet?: { weight: number; reps: number };
};

/**
 * Renders a “Last: W×R” line and a short second line; uses English regex on model output,
 * but displays user-facing copy via `t` / `locale`.
 */
export function parseExerciseReasonForDisplay(
  reason: string,
  t: T,
  locale: AppLocale,
  options?: ParseExerciseReasonOptions,
): { lastLine: string | null; decisionLine: string; decisionKind: DecisionKind } {
  const raw = reason.replace(/\r\n/g, "\n").trim();
  if (!raw) {
    return { lastLine: null, decisionLine: "", decisionKind: "progress" };
  }

  let lastLine: string | null = null;
  let wRepOrBy: string | null = null;
  const wRep = /(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+)/.exec(raw);
  if (wRep) {
    const pw = parseFloat(wRep[1]!);
    const pr = parseInt(wRep[2]!, 10);
    let usePw = pw;
    let usePr = pr;
    const log = options?.latestSessionSets;
    const first = options?.suggestedFirstSet;
    if (
      log &&
      log.length > 0 &&
      first &&
      !Number.isNaN(pw) &&
      Number.isFinite(pw) &&
      isSessionSetWarmup(log, pw, pr)
    ) {
      const comp = pickWorkingSetForComparison(log, first.weight, first.reps);
      if (comp) {
        usePw = comp.weight;
        usePr = comp.reps;
      }
    }
    lastLine = `${t("exercise_last")}: ${formatWeightReps(usePw, usePr)}`;
    wRepOrBy = wRep[0];
  } else {
    const by = /(\d+(?:\.\d+)?)\s*by\s*(\d+)/i.exec(raw);
    if (by) {
      const pw = parseFloat(by[1]!);
      const pr = parseInt(by[2]!, 10);
      let usePw = pw;
      let usePr = pr;
      const log = options?.latestSessionSets;
      const first = options?.suggestedFirstSet;
      if (
        log &&
        log.length > 0 &&
        first &&
        !Number.isNaN(pw) &&
        isSessionSetWarmup(log, pw, pr)
      ) {
        const comp = pickWorkingSetForComparison(log, first.weight, first.reps);
        if (comp) {
          usePw = comp.weight;
          usePr = comp.reps;
        }
      }
      lastLine = `${t("exercise_last")}: ${formatWeightReps(usePw, usePr)}`;
      wRepOrBy = by[0];
    }
  }

  const kgPlus = /[+]\s*(\d+(?:\.\d+)?)\s*kg/i.exec(raw);
  const pctIncr = /(?:increase|by|add)\D*(\d+(?:\.\d+)?)\s*%/i.exec(raw);

  let decisionLine: string;
  if (kgPlus) {
    decisionLine = formatKgProgression(kgPlus[1], locale, t);
  } else if (/maintain|hold\s*weight|same\s*weight/i.test(raw)) {
    decisionLine = t("maintain_weight");
  } else if (/deload|easer|easier|recovery/i.test(raw)) {
    decisionLine = t("deload");
  } else if (/volume\s*focus|volume\s*priority/i.test(raw)) {
    decisionLine = t("volume_focus");
  } else if (pctIncr) {
    decisionLine = formatPctProgression(pctIncr[1], locale, t);
  } else {
    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lastLine && sentences.length > 1) {
      decisionLine = capExplanation(sentences.slice(1).join(" "));
    } else if (lastLine && wRepOrBy) {
      const i = raw.indexOf(wRepOrBy);
      const after = i >= 0 ? raw.slice(i + wRepOrBy.length) : raw;
      decisionLine = capExplanation(
        after
          .replace(/^[.;\s,]+/g, "")
          .replace(/^(?:comfortably|and)\s*[,.\s]*/i, "")
          .trim() || t("exercise_default_progression"),
      );
    } else {
      decisionLine = capExplanation(raw);
    }
  }

  if (!decisionLine) decisionLine = capExplanation(raw);
  const decisionKind = detectDecisionKind(raw + " " + decisionLine);

  return { lastLine, decisionLine, decisionKind };
}
