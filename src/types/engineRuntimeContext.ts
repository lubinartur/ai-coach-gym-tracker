import type { AiDecisionContext } from "@/types/aiCoach";
import type { RecoveryState } from "@/services/recoveryEngine";
import type { CoachMemoryContext } from "@/services/aiCoachMemory";
import type { DecisionTrace } from "@/types/decisionTrace";

export type EngineRuntimeContext = {
  decision: AiDecisionContext;
  recovery: RecoveryState;
  coachMemory?: CoachMemoryContext;
  trace: DecisionTrace;
  /** Unix ms timestamp for deterministic “now”-based decisions. */
  now: number;
};

