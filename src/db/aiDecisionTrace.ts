import { db } from "@/db/database";
import { createId } from "@/lib/id";

export type AiDecisionTraceMode = "coach" | "history" | "adaptive";

export type AiDecisionTraceRow = {
  id: string;
  createdAt: number;
  mode: AiDecisionTraceMode;
  generationSource: string;
  insightSource: string;

  split: string;
  preferredSplits: string[];

  qualityCheckPassed: boolean;

  strengthCalibrationUsed: boolean;
  payloadHasCalibration: boolean;
  decisionContextHasCalibration: boolean;

  exerciseLoadSources: Array<{
    exercise: string;
    source: "history" | "calibration" | "calibration_rpe" | "llm" | "fallback";
    finalWeight?: number;
  }>;

  exerciseNames: string[];
};

export type AiDecisionTraceInsert = Omit<AiDecisionTraceRow, "id" | "createdAt"> & {
  id?: string;
  createdAt?: number;
};

export async function saveAiDecisionTrace(
  trace: AiDecisionTraceInsert,
): Promise<AiDecisionTraceRow> {
  const row: AiDecisionTraceRow = {
    id: trace.id?.trim() || createId(),
    createdAt:
      typeof trace.createdAt === "number" && Number.isFinite(trace.createdAt)
        ? trace.createdAt
        : Date.now(),
    mode: trace.mode,
    generationSource: String(trace.generationSource ?? "").trim() || "unknown",
    insightSource: String(trace.insightSource ?? "").trim() || "unknown",
    split: String(trace.split ?? "").trim() || "Unknown",
    preferredSplits: Array.isArray(trace.preferredSplits)
      ? trace.preferredSplits.map((s) => String(s)).filter(Boolean)
      : [],
    qualityCheckPassed: trace.qualityCheckPassed === true,
    strengthCalibrationUsed: trace.strengthCalibrationUsed === true,
    payloadHasCalibration: trace.payloadHasCalibration === true,
    decisionContextHasCalibration: trace.decisionContextHasCalibration === true,
    exerciseLoadSources: Array.isArray(trace.exerciseLoadSources)
      ? trace.exerciseLoadSources
          .filter((x) => x && typeof x === "object")
          .map((x) => {
            const r = x as Record<string, unknown>;
            const source =
              r.source === "history" ||
              r.source === "calibration" ||
              r.source === "calibration_rpe" ||
              r.source === "llm" ||
              r.source === "fallback"
                ? (r.source as AiDecisionTraceRow["exerciseLoadSources"][number]["source"])
                : "fallback";
            const finalWeight =
              typeof r.finalWeight === "number" && Number.isFinite(r.finalWeight)
                ? r.finalWeight
                : undefined;
            return {
              exercise: String(r.exercise ?? "").trim(),
              source,
              ...(finalWeight !== undefined ? { finalWeight } : {}),
            };
          })
          .filter((x) => x.exercise)
      : [],
    exerciseNames: Array.isArray(trace.exerciseNames)
      ? trace.exerciseNames.map((s) => String(s)).filter(Boolean)
      : [],
  };
  await db.aiDecisionTraces.put(row);
  return row;
}

export async function listAiDecisionTraces(
  limit = 50,
): Promise<AiDecisionTraceRow[]> {
  const n = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.round(limit))) : 50;
  return await db.aiDecisionTraces.orderBy("createdAt").reverse().limit(n).toArray();
}

export async function clearAiDecisionTraces(): Promise<void> {
  await db.aiDecisionTraces.clear();
}

