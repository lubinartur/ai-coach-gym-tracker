import type {
  AthleteExperience,
  StrengthCalibration,
  StrengthCalibrationEntry,
} from "@/types/athleteProfile";
import type { AiCoachRequestPayload } from "@/types/aiCoach";

function normalizeCalibrationEntry(x: unknown): StrengthCalibrationEntry | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  const w = Number(o.weight);
  const reps = Number(o.reps);
  if (!Number.isFinite(w) || w <= 0) return undefined;
  if (!Number.isFinite(reps) || reps <= 0) return undefined;
  return { weight: w, reps: Math.round(reps) };
}

/**
 * Turn any loose `strengthCalibration` blob from the client into a safe object,
 * or `undefined` if nothing usable.
 */
function normalizeStrengthCalibration(
  x: unknown,
): StrengthCalibration | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  const out: StrengthCalibration = {
    benchPress: normalizeCalibrationEntry(o.benchPress),
    squatOrLegPress: normalizeCalibrationEntry(o.squatOrLegPress),
    deadliftOrRdl: normalizeCalibrationEntry(o.deadliftOrRdl),
    latPulldownOrPullup: normalizeCalibrationEntry(o.latPulldownOrPullup),
    shoulderPress: normalizeCalibrationEntry(o.shoulderPress),
  };
  return (
    out.benchPress ||
    out.squatOrLegPress ||
    out.deadliftOrRdl ||
    out.latPulldownOrPullup ||
    out.shoulderPress
  )
    ? out
    : undefined;
}

/**
 * Prefer `athleteProfile.strengthCalibration` if it normalizes to at least one
 * valid entry; else use `aiDecisionContext.athleteProfile.strengthCalibration`.
 * Avoids a nested profile object (possibly missing calibration) from masking
 * the top-level profile via `aiDecisionContext?.athleteProfile ?? athleteProfile`.
 */
export function getStrengthCalibrationFromPayload(
  input: Pick<AiCoachRequestPayload, "athleteProfile" | "aiDecisionContext">,
): StrengthCalibration | undefined {
  const topRaw = (input.athleteProfile as Record<string, unknown> | undefined)
    ?.strengthCalibration;
  const top = normalizeStrengthCalibration(topRaw);
  if (top) return top;
  const ctxRaw = (input.aiDecisionContext?.athleteProfile as
    | Record<string, unknown>
    | undefined)?.strengthCalibration;
  return normalizeStrengthCalibration(ctxRaw);
}

export function strengthCalibrationHasAny(
  c: StrengthCalibration | undefined,
): c is StrengthCalibration {
  if (!c) return false;
  return Boolean(
    c.benchPress ||
      c.squatOrLegPress ||
      c.deadliftOrRdl ||
      c.latPulldownOrPullup ||
      c.shoulderPress,
  );
}

/**
 * For experience and limitations, prefer the top-level serialized profile, then
 * the nested one — consistent with not letting an empty or partial object win
 * for calibration-adjacent fields.
 */
export function getAthleteLoadContext(
  input: Pick<AiCoachRequestPayload, "athleteProfile" | "aiDecisionContext">,
): {
  strengthCalibration: StrengthCalibration | undefined;
  experience: AthleteExperience | undefined;
  limitations: string[] | undefined;
} {
  const top = (input.athleteProfile as Record<string, unknown> | undefined) ?? {};
  const ctx = (input.aiDecisionContext?.athleteProfile as Record<string, unknown> | undefined) ?? {};
  const strengthCalibration = getStrengthCalibrationFromPayload(input);
  const expTop = top.experience;
  const expCtx = ctx.experience;
  const exp =
    expTop === "beginner" || expTop === "intermediate" || expTop === "advanced"
      ? expTop
      : expCtx === "beginner" || expCtx === "intermediate" || expCtx === "advanced"
        ? expCtx
        : undefined;
  const limTop = top.limitations;
  const limCtx = ctx.limitations;
  const limitationsA = Array.isArray(limTop) ? limTop : undefined;
  const limitationsB = Array.isArray(limCtx) ? limCtx : undefined;
  const limitations = (limitationsA ?? limitationsB)
    ? (limitationsA ?? limitationsB)!.filter((x) => typeof x === "string")
    : undefined;
  return { strengthCalibration, experience: exp, limitations };
}
