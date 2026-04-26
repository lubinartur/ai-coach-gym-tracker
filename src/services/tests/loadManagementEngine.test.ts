import { describe, expect, it } from "vitest";
import { evaluateLoadManagement } from "@/services/loadManagementEngine";
import type { TrainingAdaptationState } from "@/services/trainingAdaptationEngine";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";

function adaptation(
  partial?: Partial<TrainingAdaptationState>,
): TrainingAdaptationState {
  return {
    stagnatingExercises: [],
    fatigueAccumulation: false,
    recommendedAdjustments: [],
    ...partial,
  };
}

function runtime(input: {
  deloadRecommended: boolean;
  globalFatigueLevel: "low" | "moderate" | "high" | "unknown";
  deloadVolumeMultiplier?: number;
}) {
  return {
    recovery: {
      deloadRecommended: input.deloadRecommended,
      globalFatigueLevel: input.globalFatigueLevel,
      rules: {
        deloadVolumeMultiplier: input.deloadVolumeMultiplier ?? 0.6,
      },
    },
  } as unknown as EngineRuntimeContext;
}

describe("LoadManagementEngine.evaluateLoadManagement", () => {
  it("normal", () => {
    const out = evaluateLoadManagement(
      runtime({ deloadRecommended: false, globalFatigueLevel: "moderate" }),
      adaptation({ fatigueAccumulation: false }),
    );
    expect(out.weeklyLoadStatus).toBe("normal");
    expect(out.volumeMultiplier).toBe(1);
    expect(out.intensityMultiplier).toBe(1);
    expect(out.recommendedAction).toBe("maintain");
  });

  it("elevated fatigue accumulation", () => {
    const out = evaluateLoadManagement(
      runtime({ deloadRecommended: false, globalFatigueLevel: "moderate" }),
      adaptation({ fatigueAccumulation: true }),
    );
    expect(out.weeklyLoadStatus).toBe("elevated");
    expect(out.volumeMultiplier).toBeCloseTo(0.85, 2);
    expect(out.intensityMultiplier).toBeCloseTo(0.9, 2);
    expect(out.recommendedAction).toBe("reduce_volume");
  });

  it("high fatigue", () => {
    const out = evaluateLoadManagement(
      runtime({ deloadRecommended: false, globalFatigueLevel: "high" }),
      adaptation({ fatigueAccumulation: false }),
    );
    expect(out.weeklyLoadStatus).toBe("high");
    expect(out.volumeMultiplier).toBeCloseTo(0.75, 2);
    expect(out.intensityMultiplier).toBeCloseTo(0.85, 2);
    expect(out.recommendedAction).toBe("reduce_volume");
  });

  it("explicit deload", () => {
    const out = evaluateLoadManagement(
      runtime({
        deloadRecommended: true,
        globalFatigueLevel: "high",
        deloadVolumeMultiplier: 0.6,
      }),
      adaptation({ fatigueAccumulation: true }),
    );
    expect(out.weeklyLoadStatus).toBe("deload");
    expect(out.volumeMultiplier).toBeCloseTo(0.6, 2);
    expect(out.intensityMultiplier).toBeCloseTo(0.7, 2);
    expect(out.recommendedAction).toBe("deload");
  });
});

