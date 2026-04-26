import type { AiDecisionContext } from "@/types/aiCoach";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import { evaluateRecoveryState } from "@/services/recoveryEngine";
import { buildCoachMemoryContext } from "@/services/aiCoachMemory";

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
 *
 * Note: Coach memory currently uses browser storage; on the server this will
 * resolve to empty memory until a persistent server-accessible store is added.
 */
export async function buildEngineRuntimeContextWithMemory(
  decision: AiDecisionContext,
): Promise<EngineRuntimeContext> {
  const recovery = evaluateRecoveryState(decision);
  const exercises =
    decision.recentWorkouts?.flatMap((w) => w.exercises).map((e) => e.name) ?? [];
  const coachMemory = await buildCoachMemoryContext({ exercises });
  return {
    decision,
    recovery,
    coachMemory,
    trace: { traceId: crypto.randomUUID(), entries: [] },
    now: Date.now(),
  };
}

