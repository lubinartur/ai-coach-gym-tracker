import { normalizeExerciseName } from "@/lib/exerciseName";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import type { CoachMemoryEntry } from "@/services/aiCoachMemory";

export type TrainingAdaptationState = {
  stagnatingExercises: string[];
  fatigueAccumulation: boolean;
  recommendedAdjustments: Array<{
    type: "reduce_volume" | "swap_exercise" | "change_split_emphasis";
    target?: string;
    reason: string;
  }>;
};

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function hasRecentMemoryDecision(
  runtime: EngineRuntimeContext,
  exName: string,
  decision: CoachMemoryEntry["decision"],
): boolean {
  const mem = runtime.coachMemory?.exerciseMemories ?? {};
  const key = normalizeExerciseName(exName);
  if (!key) return false;
  const rows = mem[key] ?? [];
  return rows.slice(0, 6).some((r) => r.decision === decision);
}

/**
 * Detect multi-workout adaptation needs from runtime context (signals + plans + memory).
 * This is advisory only; it does not mutate the decision context or the workout generator.
 */
export function evaluateTrainingAdaptation(
  runtime: EngineRuntimeContext,
): TrainingAdaptationState {
  const hist = runtime.decision.exerciseHistory ?? [];
  const plan = runtime.decision.progressionPlan;
  const fatigueLevel = runtime.recovery.globalFatigueLevel;

  // Rule: 3 sessions stagnation -> stagnating exercise.
  const stagnatingExercises = uniq(
    hist
      .filter((h) => (h.trend === "stagnating" && (h.stagnationSessions ?? 0) >= 3))
      .map((h) => h.name),
  );

  // Fatigue accumulation: high fatigue + notable rep drops across history rows.
  const repDropHits = hist.filter((h) =>
    (h.recent ?? []).some((r) => (r.repDrop ?? 0) > 3),
  ).length;
  const fatigueAccumulation = fatigueLevel === "high" && repDropHits >= 2;

  const recommendedAdjustments: TrainingAdaptationState["recommendedAdjustments"] = [];

  if (fatigueAccumulation) {
    recommendedAdjustments.push({
      type: "reduce_volume",
      reason: "High fatigue with repeated rep drops suggests fatigue accumulation; reduce volume and consolidate.",
    });
  }

  // Repeated stagnation -> swap exercise recommendation.
  for (const ex of stagnatingExercises) {
    const alreadySwappedRecently = hasRecentMemoryDecision(runtime, ex, "swap_exercise");
    const alreadyPlannedSwap = (plan?.exercisePlans ?? []).some(
      (p) => normalizeExerciseName(p.exerciseName) === normalizeExerciseName(ex) && p.action === "swap_exercise",
    );
    if (alreadySwappedRecently || alreadyPlannedSwap) continue;
    recommendedAdjustments.push({
      type: "swap_exercise",
      target: ex,
      reason: "Stagnating 3+ sessions; recommend a close variation swap to refresh stimulus and progression.",
    });
  }

  // Split emphasis adjustment: if many stalled exercises share a muscle bucket and recovery is ready, bias emphasis.
  // (Best-effort: uses memory presence + stagnation count; does not require new metadata.)
  if (stagnatingExercises.length >= 3 && fatigueLevel !== "high") {
    recommendedAdjustments.push({
      type: "change_split_emphasis",
      reason: "Multiple stagnating exercises detected; consider shifting split emphasis toward the lagging pattern while recovery allows.",
    });
  }

  return {
    stagnatingExercises,
    fatigueAccumulation,
    recommendedAdjustments,
  };
}

