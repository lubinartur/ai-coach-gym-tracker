import type {
  AiTrainingSignalsResponse,
  TrainingSignals,
} from "@/types/aiCoach";

/** Shared by server (finalize) and client (normalize); does not need i18n. */
export function buildDisplayTrainingSignals(
  ts: TrainingSignals,
  nextTitle: string,
  sessionType: string,
): AiTrainingSignalsResponse {
  const pattern = ts.recentSplitPattern.filter(Boolean);
  const title = nextTitle.trim();
  const st = sessionType.trim();
  const split =
    pattern.length > 0
      ? `${pattern.join(" → ")}${title ? ` → ${title}` : ""}`.trim()
      : title || "—";
  return {
    split: split,
    fatigue: ts.fatigueSignal,
    volume_trend: ts.volumeTrend,
    strategy: st || "Normal progression",
  };
}
