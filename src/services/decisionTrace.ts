import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import type { DecisionTraceEntry } from "@/types/decisionTrace";

export function addTrace(
  runtime: EngineRuntimeContext,
  entry: DecisionTraceEntry,
) {
  runtime.trace.entries.push(entry);
}

