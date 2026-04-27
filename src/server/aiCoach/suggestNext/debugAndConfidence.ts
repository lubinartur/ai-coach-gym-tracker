import { getStrengthCalibrationFromPayload } from "@/lib/aiCoachStrengthCalibrationResolve";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { estimateBaselineWeightForExerciseFromCalibration } from "@/lib/strengthCalibration";
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

  const top = (input.athleteProfile as Record<string, unknown> | undefined) ?? {};
  const ctx = (input.aiDecisionContext?.athleteProfile as Record<string, unknown> | undefined) ?? {};
  const sc = getStrengthCalibrationFromPayload(input);
  const expTop = top.experience;
  const expCtx = ctx.experience;
  const exp =
    expTop === "beginner" || expTop === "intermediate" || expTop === "advanced"
      ? expTop
      : expCtx === "beginner" || expCtx === "intermediate" || expCtx === "advanced"
        ? expCtx
        : undefined;
  const limA = Array.isArray(top.limitations) ? top.limitations : undefined;
  const limB = Array.isArray(ctx.limitations) ? ctx.limitations : undefined;
  const limitations = (limA ?? limB)
    ? (limA ?? limB)!.filter((x) => typeof x === "string")
    : undefined;
  const calibratedExercises = (r.exercises ?? [])
    .map((ex) => {
      const est = estimateBaselineWeightForExerciseFromCalibration({
        exerciseName: ex.name,
        calibration: sc,
        experience: exp,
        limitations,
      });
      if (!est) return null;
      const w0 = ex.sets?.[0]?.weight;
      const match =
        typeof w0 === "number" && Number.isFinite(w0) && Math.abs(w0 - est.weight) <= 1.25;
      if (!match) return null;
      return {
        exercise: ex.name,
        sourceLift: est.sourceLift,
        estimatedWeight: est.weight,
      };
    })
    .filter(Boolean) as NonNullable<SuggestNextWorkoutAiDebug["calibratedExercises"]>;

  const strengthCalibrationUsed = calibratedExercises.length > 0;

  const payloadHasStrengthCalibration = Boolean(
    input.athleteProfile &&
      typeof input.athleteProfile === "object" &&
      "strengthCalibration" in (input.athleteProfile as Record<string, unknown>) &&
      (input.athleteProfile as Record<string, unknown>).strengthCalibration &&
      typeof (input.athleteProfile as Record<string, unknown>).strengthCalibration === "object",
  );
  const decisionContextHasStrengthCalibration = Boolean(
    input.aiDecisionContext?.athleteProfile &&
      typeof input.aiDecisionContext.athleteProfile === "object" &&
      "strengthCalibration" in (input.aiDecisionContext.athleteProfile as Record<string, unknown>) &&
      (input.aiDecisionContext.athleteProfile as Record<string, unknown>).strengthCalibration &&
      typeof (input.aiDecisionContext.athleteProfile as Record<string, unknown>).strengthCalibration ===
        "object",
  );

  const existing = (r.aiDebug ?? {}) as Partial<SuggestNextWorkoutAiDebug>;
  const aiDebug: SuggestNextWorkoutAiDebug = {
    ...existing,
    ...base,
    strengthCalibrationUsed,
    calibratedExercises: strengthCalibrationUsed ? calibratedExercises : [],
    strengthCalibrationDebug: {
      payloadHasStrengthCalibration,
      decisionContextHasStrengthCalibration,
    },
    ...(process.env.NODE_ENV === "development" && insightMeta
      ? {
          insightSource: insightMeta.source,
          insightWarnings: insightMeta.warnings,
        }
      : {}),
  };
  return { ...r, aiDebug };
}
