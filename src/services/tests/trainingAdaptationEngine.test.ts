import { describe, expect, it } from "vitest";
import { evaluateTrainingAdaptation } from "@/services/trainingAdaptationEngine";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import type { CoachMemoryEntry } from "@/services/aiCoachMemory";

function runtime(input: {
  fatigueLevel: "low" | "moderate" | "high" | "unknown";
  exerciseHistory?: unknown[];
  coachMemory?: Record<string, Array<Pick<CoachMemoryEntry, "decision">>>;
}) {
  return {
    decision: {
      exerciseHistory: input.exerciseHistory ?? [],
      progressionPlan: { globalStrategy: "maintain", exercisePlans: [] },
    },
    recovery: { globalFatigueLevel: input.fatigueLevel },
    coachMemory: input.coachMemory
      ? { exerciseMemories: input.coachMemory }
      : { exerciseMemories: {} },
  } as unknown as EngineRuntimeContext;
}

describe("TrainingAdaptationEngine.evaluateTrainingAdaptation", () => {
  it("detects stagnating exercise", () => {
    const out = evaluateTrainingAdaptation(
      runtime({
        fatigueLevel: "moderate",
        exerciseHistory: [
          {
            name: "Bench Press",
            trend: "stagnating",
            stagnationSessions: 3,
            recent: [],
          },
        ],
      }),
    );
    expect(out.stagnatingExercises).toContain("Bench Press");
  });

  it("detects fatigue accumulation", () => {
    const out = evaluateTrainingAdaptation(
      runtime({
        fatigueLevel: "high",
        exerciseHistory: [
          {
            name: "Bench Press",
            trend: "stable",
            stagnationSessions: 0,
            recent: [{ repDrop: 4 }],
          },
          {
            name: "Barbell Row",
            trend: "stable",
            stagnationSessions: 0,
            recent: [{ repDrop: 5 }],
          },
        ],
      }),
    );
    expect(out.fatigueAccumulation).toBe(true);
  });

  it("avoids duplicate swap recommendation from coach memory", () => {
    const out = evaluateTrainingAdaptation(
      runtime({
        fatigueLevel: "moderate",
        exerciseHistory: [
          {
            name: "Bench Press",
            trend: "stagnating",
            stagnationSessions: 3,
            recent: [],
          },
        ],
        coachMemory: {
          "bench press": [{ decision: "swap_exercise" }],
        },
      }),
    );
    const swaps = out.recommendedAdjustments.filter((a) => a.type === "swap_exercise");
    expect(swaps.some((s) => s.target === "Bench Press")).toBe(false);
  });
});

