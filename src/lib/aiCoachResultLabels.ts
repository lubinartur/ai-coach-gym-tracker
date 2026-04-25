import { QUICK_WORKOUT_TEMPLATES } from "@/lib/workoutQuickTemplates";
import type { AppLanguage } from "@/i18n/language";
import type { MessageKey } from "@/i18n/dictionary";
import { decisionToMessageKey } from "@/lib/aiCoachDisplay";
import type { ExerciseDecision } from "@/types/aiCoach";

const SESSION_TYPE_KEYS: Record<string, MessageKey> = {
  "Normal progression": "st_session_normal",
  "Volume focus": "st_session_volume",
  "Intensity focus": "st_session_intensity",
  "Recovery session": "st_session_recovery",
  "Technique session": "st_session_technique",
};

const STRATEGY_PRECISE_KEYS: Record<string, MessageKey> = {
  "Progressive overload": "strategy_progressive_overload",
  "Progressive Overload": "strategy_progressive_overload",
  "Progressive load": "strategy_progressive_overload",
  "Normal progression": "st_session_normal",
  "Volume focus": "st_session_volume",
  "Recovery": "strategy_recovery",
  "Deload": "deload",
};

type T = (k: MessageKey) => string;

export function translateSessionType(sessionType: string, t: T): string {
  const k = SESSION_TYPE_KEYS[sessionType.trim()];
  return k ? t(k) : sessionType.trim();
}

export function translateStrategyValue(strategy: string, t: T): string {
  const s = strategy.trim();
  if (!s) return t("em_dash");
  const k = STRATEGY_PRECISE_KEYS[s];
  if (k) return t(k);
  if (/progressive overload/i.test(s)) return t("strategy_progressive_overload");
  return s;
}

/** e.g. "Push" / "push day" / "Push A" — append muscle line from quick templates. */
export function muscleLineForHeroTitle(title: string): string | null {
  const t0 = title.trim();
  if (!t0) return null;
  const lo = t0.toLowerCase();
  const m = QUICK_WORKOUT_TEMPLATES.find(
    (x) => lo === x.label.toLowerCase() || lo.startsWith(`${x.label.toLowerCase()} `),
  );
  return m ? m.muscleLine : null;
}

/**
 * Map common English API phrases in decision_label for Russian (and light EN cleanup).
 */
export function localizeDecisionLabel(
  label: string,
  decision: ExerciseDecision,
  locale: AppLanguage,
  t: T,
): string {
  const raw = label.trim();
  if (!raw) return t(decisionToMessageKey(decision));
  if (locale === "en") return raw;
  /* Russian UI: replace stock English phrases, keep numbers/% as-is. */
  let s = raw;
  s = s.replace(/\bMaintain weight\b/gi, t("decision_maintain"));
  s = s.replace(/\bReduce load\b/gi, t("decision_reduce"));
  s = s.replace(/\bTechnique focus\b/gi, t("decision_technique"));
  s = s.replace(/\bVolume focus\b/gi, t("decision_volume"));
  s = s.replace(/\+2\.5kg progression/gi, `+2,5 ${t("stat_unit_kg")} ${t("progression")}`);
  s = s.replace(
    /(\+?\d+(?:[.,]\d+)?)\s*%\s*progression/gi,
    (_, n: string) => `${String(n).replace(".", ",")}% ${t("progression")}`,
  );
  s = s.replace(/\bprogression\b/gi, t("progression"));
  return s;
}
