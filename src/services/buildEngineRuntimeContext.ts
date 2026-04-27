import type { AiDecisionContext } from "@/types/aiCoach";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import { evaluateRecoveryState } from "@/services/recoveryEngine";
import type { CoachMemoryContext } from "@/services/aiCoachMemory";

export function buildEngineRuntimeContext(
  decision: AiDecisionContext,
): EngineRuntimeContext {
  const recovery = evaluateRecoveryState(decision);
  return {
    decision,
    recovery,
    trace: { traceId: crypto.randomUUID(), entries: [] },
    now: Date.now(),
  };
}

/**
 * Async builder that also attaches Coach Memory context.
 * Memory must be provided by the caller (e.g. client-built Dexie context) to avoid
 * any server-side storage reads.
 */
export async function buildEngineRuntimeContextWithMemory(
  decision: AiDecisionContext,
  coachMemory?: CoachMemoryContext,
): Promise<EngineRuntimeContext> {
  const recovery = evaluateRecoveryState(decision);
  return {
    decision,
    recovery,
    coachMemory: coachMemory ?? { exerciseMemories: {} },
    trace: { traceId: crypto.randomUUID(), entries: [] },
    now: Date.now(),
  };
}

