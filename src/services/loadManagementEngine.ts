import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import type { TrainingAdaptationState } from "@/services/trainingAdaptationEngine";

export type LoadManagementState = {
  weeklyLoadStatus: "normal" | "elevated" | "high" | "deload";
  volumeMultiplier: number;
  intensityMultiplier: number;
  recommendedAction: "maintain" | "reduce_volume" | "reduce_intensity" | "deload";
  reasons: string[];
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

export function evaluateLoadManagement(
  runtime: EngineRuntimeContext,
  adaptation: TrainingAdaptationState,
): LoadManagementState {
  // Rule 1: defaults
  let weeklyLoadStatus: LoadManagementState["weeklyLoadStatus"] = "normal";
  let volumeMultiplier = 1;
  let intensityMultiplier = 1;
  let recommendedAction: LoadManagementState["recommendedAction"] = "maintain";
  const reasons: string[] = [];

  // Rule 2: deload recommended
  if (runtime.recovery.deloadRecommended) {
    weeklyLoadStatus = "deload";
    volumeMultiplier = runtime.recovery.rules.deloadVolumeMultiplier;
    intensityMultiplier = 0.7;
    recommendedAction = "deload";
    reasons.push("deload_recommended");
  } else if (runtime.recovery.globalFatigueLevel === "high") {
    // Rule 3: high fatigue
    weeklyLoadStatus = "high";
    volumeMultiplier = 0.75;
    intensityMultiplier = 0.85;
    recommendedAction = "reduce_volume";
    reasons.push("global_fatigue_high");
  } else if (adaptation.fatigueAccumulation) {
    // Rule 4: fatigue accumulation
    weeklyLoadStatus = "elevated";
    volumeMultiplier = 0.85;
    intensityMultiplier = 0.9;
    recommendedAction = "reduce_volume";
    reasons.push("fatigue_accumulation");
  }

  // Rule 5: multiple stagnating exercises -> reduce intensity
  if ((adaptation.stagnatingExercises ?? []).length >= 3) {
    // Do not override an explicit deload.
    if (recommendedAction !== "deload") {
      recommendedAction = "reduce_intensity";
    }
    reasons.push("multiple_stagnating_exercises");
  }

  return {
    weeklyLoadStatus,
    volumeMultiplier: clamp01(volumeMultiplier),
    intensityMultiplier: clamp01(intensityMultiplier),
    recommendedAction,
    reasons,
  };
}

