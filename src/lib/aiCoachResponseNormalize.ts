import { cap } from "@/lib/string/cap";
import { inferDecisionFromReason } from "@/lib/aiCoachDecisionInfer";
import { buildDisplayTrainingSignals } from "@/lib/aiTrainingSignalsFormat";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type {
  AiInsight,
  AiTrainingSignalsResponse,
  ExerciseDecision,
  FatigueSignal,
  SuggestNextWorkoutAiDebug,
  SuggestNextWorkoutAiExercise,
  SuggestNextWorkoutResponse,
  TrainingSignals,
  VolumeTrend,
} from "@/types/aiCoach";

const SESSION_TYPES = [
  "Normal progression",
  "Volume focus",
  "Intensity focus",
  "Recovery session",
  "Technique session",
] as const;

const DECISIONS: ExerciseDecision[] = [
  "increase",
  "maintain",
  "reduce",
  "technique",
  "volume",
];

const EXERCISE_REASON_MAX = 150;

const DEFAULT_LABEL: Record<ExerciseDecision, string> = {
  increase: "+2.5kg progression",
  maintain: "Maintain weight",
  reduce: "Reduce load",
  technique: "Technique focus",
  volume: "Volume focus",
};

const F: FatigueSignal[] = ["low", "moderate", "high", "unknown"];
const V: VolumeTrend[] = ["up", "down", "stable", "unknown"];

function isFatigue(s: string): s is FatigueSignal {
  return (F as string[]).includes(s);
}
function isVolume(s: string): s is VolumeTrend {
  return (V as string[]).includes(s);
}
function isDecision(s: string): s is ExerciseDecision {
  return (DECISIONS as string[]).includes(s);
}

function parseSets(arr: unknown): { weight: number; reps: number }[] | null {
  if (!Array.isArray(arr) || arr.length < 1) return null;
  const out: { weight: number; reps: number }[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") return null;
    const r = s as Record<string, unknown>;
    const weight = Number(r.weight);
    const reps = Number(r.reps);
    if (!Number.isFinite(weight) || weight < 0) return null;
    if (!Number.isFinite(reps) || reps < 0) return null;
    out.push({ weight, reps: Math.round(reps) });
  }
  return out;
}

function normalizeExercisesClient(
  raw: unknown,
): SuggestNextWorkoutAiExercise[] | null {
  if (!Array.isArray(raw) || raw.length < 1) return null;
  const out: SuggestNextWorkoutAiExercise[] = [];
  for (const ex of raw) {
    if (!ex || typeof ex !== "object") return null;
    const e = ex as Record<string, unknown>;
    if (typeof e.name !== "string" || !e.name.trim()) return null;
    const sets = parseSets(e.sets);
    if (!sets) return null;
    const reasonStr =
      typeof e.reason === "string" && e.reason.trim()
        ? e.reason.trim()
        : "Suggested from your log.";
    const reason = cap(reasonStr, EXERCISE_REASON_MAX);
    const dec =
      typeof e.decision === "string" && isDecision(e.decision)
        ? e.decision
        : inferDecisionFromReason(reason);
    const label =
      typeof e.decision_label === "string" && e.decision_label.trim()
        ? e.decision_label.trim()
        : DEFAULT_LABEL[dec];
    out.push({
      name: e.name.trim(),
      sets,
      reason,
      decision: dec,
      decision_label: cap(label, 80),
    });
  }
  return out;
}

function normalizeTrainingSignals(
  o: Record<string, unknown>,
  title: string,
  sessionType: string,
  clientSignals: TrainingSignals | null,
): AiTrainingSignalsResponse {
  const ts = o.training_signals;
  if (ts && typeof ts === "object") {
    const t = ts as Record<string, unknown>;
    const split = typeof t.split === "string" && t.split.trim() ? t.split.trim() : null;
    const fa = t.fatigue;
    const vo = t.volume_trend;
    const st = typeof t.strategy === "string" && t.strategy.trim() ? t.strategy.trim() : null;
    if (
      split &&
      typeof fa === "string" &&
      isFatigue(fa) &&
      typeof vo === "string" &&
      isVolume(vo) &&
      st
    ) {
      return {
        split: cap(split, 200),
        fatigue: fa,
        volume_trend: vo,
        strategy: cap(st, 120),
      };
    }
  }
  if (clientSignals) {
    return buildDisplayTrainingSignals(clientSignals, title, sessionType);
  }
  return {
    split: "—",
    fatigue: "unknown",
    volume_trend: "unknown",
    strategy: sessionType,
  };
}

function normalizeInsights(raw: unknown): AiInsight[] {
  if (!Array.isArray(raw)) return [];
  const out: AiInsight[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const typeRaw = o.type;
    let type: AiInsight["type"] = "opportunity";
    if (typeof typeRaw === "string") {
      const t = typeRaw === "warning" ? "risk" : typeRaw;
      if (
        t === "progress" ||
        t === "fatigue" ||
        t === "balance" ||
        t === "risk" ||
        t === "opportunity"
      ) {
        type = t;
      }
    }
    if (typeof o.title !== "string" || !o.title.trim()) continue;
    const textRaw =
      typeof o.text === "string" && o.text.trim()
        ? o.text.trim()
        : typeof o.description === "string" && o.description.trim()
          ? o.description.trim()
          : "";
    if (!textRaw) continue;
    out.push({
      type,
      title: cap(o.title.trim(), 120),
      text: cap(textRaw, 320),
    });
  }
  return out.slice(0, 3);
}

/**
 * Ensure the suggest-next API payload matches the v2 shape (for old JSON or partial responses).
 * Safe to call on every success response.
 */
export function normalizeSuggestNextResponseClient(
  data: unknown,
  clientSignals: TrainingSignals | null,
): SuggestNextWorkoutResponse {
  if (!data || typeof data !== "object") {
    return {
      title: "Workout",
      session_type: "Normal progression",
      reason: "Could not read suggestion. Try again.",
      confidence: 20,
      training_signals: {
        split: "—",
        fatigue: "unknown",
        volume_trend: "unknown",
        strategy: "Normal progression",
      },
      insights: [],
      exercises: [],
      warnings: ["The server returned an unexpected format."],
    };
  }

  const o = data as Record<string, unknown>;
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Workout";
  const stRaw = typeof o.session_type === "string" ? o.session_type.trim() : "";
  const session_type = SESSION_TYPES.includes(
    stRaw as (typeof SESSION_TYPES)[number],
  )
    ? stRaw
    : "Normal progression";
  const reason =
    typeof o.reason === "string" && o.reason.trim()
      ? cap(o.reason.trim(), 120)
      : "Next session is ready to review below.";
  const warnings = Array.isArray(o.warnings)
    ? o.warnings.filter((w) => typeof w === "string" && w.trim()) as string[]
    : [];

  const recoverySummaryRaw = o.recoverySummary;
  const recoverySummary: SuggestNextWorkoutResponse["recoverySummary"] | undefined =
    Array.isArray(recoverySummaryRaw)
      ? recoverySummaryRaw
          .filter((x) => x && typeof x === "object")
          .map((x) => x as Record<string, unknown>)
          .map((r) => {
            const muscle = typeof r.muscle === "string" ? r.muscle : "";
            const statusRaw = r.status;
            const status: NonNullable<SuggestNextWorkoutResponse["recoverySummary"]>[number]["status"] =
              statusRaw === "ready" ||
              statusRaw === "recovering" ||
              statusRaw === "fatigued" ||
              statusRaw === "unknown"
                ? statusRaw
                : "unknown";
            const score =
              typeof r.score === "number" && Number.isFinite(r.score) ? r.score : undefined;
            return { muscle, status, score };
          })
          .filter((r) => Boolean(r.muscle))
      : undefined;

  const volumeSummaryRaw = o.volumeSummary;
  const volumeSummary: SuggestNextWorkoutResponse["volumeSummary"] | undefined =
    Array.isArray(volumeSummaryRaw)
      ? volumeSummaryRaw
          .filter((x) => x && typeof x === "object")
          .map((x) => x as Record<string, unknown>)
          .map((r) => {
            const muscle = typeof r.muscle === "string" ? r.muscle : "";
            const statusRaw = r.status;
            const status: NonNullable<SuggestNextWorkoutResponse["volumeSummary"]>[number]["status"] =
              statusRaw === "low" ||
              statusRaw === "optimal" ||
              statusRaw === "high" ||
              statusRaw === "unknown"
                ? statusRaw
                : "unknown";
            const sets =
              typeof r.sets === "number" && Number.isFinite(r.sets) ? r.sets : undefined;
            return { muscle, status, sets };
          })
          .filter((r) => Boolean(r.muscle))
      : undefined;

  const exercises = normalizeExercisesClient(o.exercises);
  if (!exercises) {
    return {
      title,
      session_type,
      reason,
      confidence: 25,
      training_signals: normalizeTrainingSignals(o, title, session_type, clientSignals),
      insights: normalizeInsights(o.insights),
      exercises: [],
      warnings: warnings.length
        ? warnings
        : ["The suggestion had no valid exercises; check your log and retry."],
      recoverySummary,
      volumeSummary,
    };
  }

  const confRaw = o.confidence;
  const confidence =
    typeof confRaw === "number" && Number.isFinite(confRaw)
      ? Math.max(0, Math.min(100, Math.round(confRaw)))
      : 55;

  const rawDebug = o.aiDebug;
  const aiDebug: SuggestNextWorkoutAiDebug | undefined =
    rawDebug && typeof rawDebug === "object"
      ? (() => {
          const d = rawDebug as Record<string, unknown>;
          const mode =
            d.mode === "history" || d.mode === "coach" ? d.mode : undefined;
          const generationSource =
            d.generationSource === "adaptive_history" ||
            d.generationSource === "coach_skeleton"
              ? d.generationSource
              : undefined;
          const insightSource =
            d.insightSource === "llm" || d.insightSource === "fallback"
              ? d.insightSource
              : undefined;
          const insightWarnings = Array.isArray(d.insightWarnings)
            ? d.insightWarnings.filter((x): x is string => typeof x === "string")
            : undefined;
          return {
            mode,
            generationSource,
            insightSource,
            insightWarnings,
            lastWorkoutTitle:
              typeof d.lastWorkoutTitle === "string" ? d.lastWorkoutTitle : "—",
            performedAt:
              typeof d.performedAt === "string" ? d.performedAt : undefined,
            createdAt:
              typeof d.createdAt === "string" ? d.createdAt : "—",
            lastWorkoutSplit:
              typeof d.lastWorkoutSplit === "string" ? d.lastWorkoutSplit : "Unknown",
            guardActive: d.guardActive === true,
            preferredNextSplits: Array.isArray(d.preferredNextSplits)
              ? d.preferredNextSplits.filter(
                  (x): x is string => typeof x === "string",
                )
              : [],
            strengthCalibrationUsed:
              typeof d.strengthCalibrationUsed === "boolean"
                ? d.strengthCalibrationUsed
                : undefined,
            calibratedExercises: Array.isArray(d.calibratedExercises)
              ? d.calibratedExercises
                  .filter((x) => x && typeof x === "object")
                  .map((x) => {
                    const c = x as Record<string, unknown>;
                    return {
                      exercise: typeof c.exercise === "string" ? c.exercise : "",
                      sourceLift: typeof c.sourceLift === "string" ? c.sourceLift : "",
                      estimatedWeight:
                        typeof c.estimatedWeight === "number" && Number.isFinite(c.estimatedWeight)
                          ? c.estimatedWeight
                          : 0,
                    };
                  })
                  .filter((x) => x.exercise && x.sourceLift && x.estimatedWeight > 0)
              : undefined,
            strengthCalibrationDebug:
              d.strengthCalibrationDebug && typeof d.strengthCalibrationDebug === "object"
                ? (() => {
                    const s = d.strengthCalibrationDebug as Record<string, unknown>;
                    return {
                      payloadHasStrengthCalibration: s.payloadHasStrengthCalibration === true,
                      decisionContextHasStrengthCalibration:
                        s.decisionContextHasStrengthCalibration === true,
                    };
                  })()
                : undefined,
            exerciseLoadDebug: Array.isArray(d.exerciseLoadDebug)
              ? d.exerciseLoadDebug
                  .filter((x) => x && typeof x === "object")
                  .map((x) => {
                    const row = x as Record<string, unknown>;
                    const source =
                      row.source === "calibration" ||
                      row.source === "llm" ||
                      row.source === "history" ||
                      row.source === "fallback"
                        ? (row.source as "calibration" | "llm" | "history" | "fallback")
                        : "fallback";
                    return {
                      exercise: typeof row.exercise === "string" ? row.exercise : "",
                      programmedLoad:
                        typeof row.programmedLoad === "number" && Number.isFinite(row.programmedLoad)
                          ? row.programmedLoad
                          : null,
                      calibrationMatch: row.calibrationMatch === true,
                      calibrationWeight:
                        typeof row.calibrationWeight === "number" && Number.isFinite(row.calibrationWeight)
                          ? row.calibrationWeight
                          : null,
                      finalWeight:
                        typeof row.finalWeight === "number" && Number.isFinite(row.finalWeight)
                          ? row.finalWeight
                          : 0,
                      source,
                    };
                  })
                  .filter((x) => x.exercise && x.finalWeight >= 0)
              : undefined,
            coachModeProfileApplied:
              typeof d.coachModeProfileApplied === "boolean"
                ? d.coachModeProfileApplied
                : undefined,
            coachModeSource:
              d.coachModeSource === "profile_starter"
                ? "profile_starter"
                : undefined,
            coachModeReason:
              typeof d.coachModeReason === "string" ? d.coachModeReason : undefined,
            splitSelection:
              d.splitSelection && typeof d.splitSelection === "object"
                ? (() => {
                    const s = d.splitSelection as Record<string, unknown>;
                    return {
                      recommendedSplit:
                        typeof s.recommendedSplit === "string"
                          ? s.recommendedSplit
                          : "Unknown",
                      candidates: Array.isArray(s.candidates)
                        ? s.candidates
                            .filter((x) => x && typeof x === "object")
                            .map((x) => {
                              const c = x as Record<string, unknown>;
                              return {
                                split: typeof c.split === "string" ? c.split : "Unknown",
                                score:
                                  typeof c.score === "number" && Number.isFinite(c.score)
                                    ? c.score
                                    : 0,
                              };
                            })
                        : [],
                      reason: typeof s.reason === "string" ? s.reason : "",
                    };
                  })()
                : undefined,
          };
        })()
      : undefined;

  return {
    title,
    session_type,
    reason,
    confidence,
    training_signals: normalizeTrainingSignals(o, title, session_type, clientSignals),
    insights: normalizeInsights(o.insights),
    exercises,
    warnings,
    aiDebug,
    recoverySummary,
    volumeSummary,
  };
}

export function findBaselineForExerciseName(
  signals: TrainingSignals | null,
  exerciseName: string,
) {
  if (!signals?.exerciseBaselines?.length) return null;
  const key = normalizeExerciseName(exerciseName);
  return (
    signals.exerciseBaselines.find(
      (b) => normalizeExerciseName(b.name) === key,
    ) ?? null
  );
}
