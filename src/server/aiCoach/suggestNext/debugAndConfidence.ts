import { normalizeExerciseName } from "@/lib/exerciseName";
import type {
  AiCoachRequestPayload,
  SuggestNextWorkoutAiDebug,
  SuggestNextWorkoutResponse,
} from "@/types/aiCoach";

export function computeConfidenceScore(
  input: AiCoachRequestPayload,
  exerciseNames: { name: string }[],
): number {
  const stats = input.exerciseStats ?? [];
  const statByKey = new Map(
    stats.map((s) => [normalizeExerciseName(s.name), s]),
  );
  const recent = input.recentSessions?.length ?? 0;
  let base = 74;
  if (recent === 0) base -= 30;
  else if (recent < 2) base -= 14;
  if (!input.trainingSignals?.recentSplitPattern?.length && recent < 3) {
    base -= 12;
  }
  if (exerciseNames.length === 0) {
    return Math.max(8, Math.min(96, Math.round(base)));
  }
  let withHistory = 0;
  for (const e of exerciseNames) {
    const n = normalizeExerciseName(e.name);
    const st = statByKey.get(n);
    if (st && st.sessionsInHistory > 0) withHistory += 1;
  }
  const ratio = withHistory / exerciseNames.length;
  const unknown = exerciseNames.length - withHistory;
  const step = base * (0.28 + 0.72 * ratio) - unknown * 5.5;
  return Math.max(8, Math.min(96, Math.round(step)));
}

export function mergeConfidence(
  modelConf: number | undefined,
  server: number,
): number {
  if (modelConf === undefined || !Number.isFinite(modelConf)) {
    return server;
  }
  const m = Math.max(0, Math.min(100, Math.round(modelConf)));
  return Math.max(0, Math.min(100, Math.round(0.42 * m + 0.58 * server)));
}

function buildSuggestNextAiDebug(
  input: AiCoachRequestPayload,
): SuggestNextWorkoutAiDebug {
  const recent = input.aiDecisionContext?.recentWorkouts?.[0];
  const g = input.aiDecisionContext?.splitContinuityGuard;
  const sel = input.aiDecisionContext?.splitSelection;
  const mode = input.aiMode === "coach_recommended" ? "coach" : "history";
  const generationSource =
    input.aiMode === "coach_recommended" ? "coach_skeleton" : "adaptive_history";
  return {
    mode,
    generationSource,
    lastWorkoutTitle: recent?.title?.trim() || "—",
    performedAt: recent?.performedAt,
    createdAt: recent?.createdAt ?? "—",
    lastWorkoutSplit: g?.lastWorkoutSplit ?? "Unknown",
    guardActive: Boolean(g?.guardActive),
    preferredNextSplits: g?.preferredNextSplits
      ? [...g.preferredNextSplits]
      : [],
    splitSelection: sel
      ? {
          recommendedSplit: sel.recommendedSplit,
          candidates: sel.candidates.map((c) => ({ split: c.split, score: c.score })),
          reason: sel.reason,
        }
      : undefined,
  };
}

export function withSuggestNextDevDebug(
  r: SuggestNextWorkoutResponse,
  input: AiCoachRequestPayload,
  insightMeta?: { source: "llm" | "fallback"; warnings: string[] },
): SuggestNextWorkoutResponse {
  const base = buildSuggestNextAiDebug(input);
  const aiDebug: SuggestNextWorkoutAiDebug = {
    ...base,
    ...(process.env.NODE_ENV === "development" && insightMeta
      ? {
          insightSource: insightMeta.source,
          insightWarnings: insightMeta.warnings,
        }
      : {}),
  };
  return { ...r, aiDebug };
}
