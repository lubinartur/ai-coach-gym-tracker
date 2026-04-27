import { describe, expect, it, vi } from "vitest";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { evaluateRecoveryState } from "@/services/recoveryEngine";
import type { AiDecisionContext } from "@/types/aiCoach";

function decision(input: {
  fatigueLevel: "low" | "moderate" | "high" | "unknown";
  phase: "build" | "consolidate" | "deload" | "unknown";
  recentWorkouts?: Array<{
    performedAt?: string;
    createdAt?: string;
    date?: string;
    exercises: {
      name: string;
      primaryMuscle?: PrimaryMuscleGroup;
      unknownExercise?: boolean;
      sets: { weight: number; reps: number; volume: number }[];
    }[];
    totalSets: number;
    totalVolume: number;
    id: string;
    title: string;
  }>;
  muscleRecovery?: Array<{
    muscleGroup: string;
    status?: "ready" | "moderate" | "fatigued" | "unknown";
    recoveryScore: number;
    weeklySets?: number;
    note?: string;
  }>;
}) {
  return {
    recentWorkouts: input.recentWorkouts ?? [],
    trainingSignals: {
      muscleRecovery: input.muscleRecovery ?? [],
      fatigueTrend: { level: input.fatigueLevel, reasons: [] },
    },
    trainingPhase: { phase: input.phase },
    progressionPlan: { globalStrategy: "maintain" },
    laggingMuscles: {
      laggingInterventionBlockers: { musclesAtWeeklyVolumeMax: [] },
    },
  } as unknown as AiDecisionContext;
}

describe("RecoveryEngine.evaluateRecoveryState", () => {
  it("muscle trained <24h ago stays fatigued/moderate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    const out = evaluateRecoveryState(
      decision({
        fatigueLevel: "low",
        phase: "build",
        recentWorkouts: [
          {
            id: "w1",
            title: "Chest",
            performedAt: "2026-04-26T00:30:00.000Z",
            createdAt: "2026-04-26T00:30:00.000Z",
            date: "2026-04-26",
            totalSets: 10,
            totalVolume: 1000,
            exercises: [{ name: "Bench Press", primaryMuscle: "chest", sets: [] }],
          },
        ],
        muscleRecovery: [{ muscleGroup: "chest", recoveryScore: 25 }],
      }),
    );
    expect(out.muscles.chest.recoveryScore).toBeLessThan(70);
    expect(["fatigued", "moderate", "unknown"]).toContain(out.muscles.chest.status);
    vi.useRealTimers();
  });

  it("muscle trained ~48h ago improves to recovering/ready", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    const out = evaluateRecoveryState(
      decision({
        fatigueLevel: "low",
        phase: "build",
        recentWorkouts: [
          {
            id: "w1",
            title: "Legs",
            performedAt: "2026-04-24T12:00:00.000Z",
            createdAt: "2026-04-24T12:00:00.000Z",
            date: "2026-04-24",
            totalSets: 12,
            totalVolume: 1200,
            exercises: [{ name: "Back Squat", primaryMuscle: "legs", sets: [] }],
          },
        ],
        muscleRecovery: [{ muscleGroup: "legs", recoveryScore: 30 }],
      }),
    );
    expect(out.muscles.legs.recoveryScore).toBeGreaterThanOrEqual(40);
    vi.useRealTimers();
  });

  it("muscle trained 72h+ ago is usually ready (unless other penalties exist)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    const out = evaluateRecoveryState(
      decision({
        fatigueLevel: "low",
        phase: "build",
        recentWorkouts: [
          {
            id: "w1",
            title: "Back",
            performedAt: "2026-04-23T08:00:00.000Z",
            createdAt: "2026-04-23T08:00:00.000Z",
            date: "2026-04-23",
            totalSets: 10,
            totalVolume: 900,
            exercises: [{ name: "Barbell Row", primaryMuscle: "back", sets: [] }],
          },
        ],
        muscleRecovery: [{ muscleGroup: "back", recoveryScore: 30 }],
      }),
    );
    expect(out.muscles.back.status).toBe("ready");
    vi.useRealTimers();
  });

  it("biceps/triceps recover faster than large muscle groups", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    const out = evaluateRecoveryState(
      decision({
        fatigueLevel: "low",
        phase: "build",
        recentWorkouts: [
          {
            id: "w1",
            title: "Arms+Chest",
            performedAt: "2026-04-24T12:00:00.000Z",
            createdAt: "2026-04-24T12:00:00.000Z",
            date: "2026-04-24",
            totalSets: 12,
            totalVolume: 800,
            exercises: [
              { name: "Barbell Curl", primaryMuscle: "biceps", sets: [] },
              { name: "Bench Press", primaryMuscle: "chest", sets: [] },
            ],
          },
        ],
        muscleRecovery: [
          { muscleGroup: "biceps", recoveryScore: 25 },
          { muscleGroup: "chest", recoveryScore: 25 },
        ],
      }),
    );
    expect(out.muscles.biceps.recoveryScore).toBeGreaterThan(out.muscles.chest.recoveryScore);
    vi.useRealTimers();
  });

  it("normal recovery", () => {
    const out = evaluateRecoveryState(
      decision({ fatigueLevel: "moderate", phase: "build" }),
    );
    expect(out.globalFatigueLevel).toBe("moderate");
    expect(out.deloadRecommended).toBe(false);
  });

  it("high fatigue (not deload)", () => {
    const out = evaluateRecoveryState(
      decision({ fatigueLevel: "high", phase: "build" }),
    );
    expect(out.globalFatigueLevel).toBe("high");
    expect(out.deloadRecommended).toBe(false);
  });

  it("explicit deload", () => {
    const out = evaluateRecoveryState(
      decision({ fatigueLevel: "moderate", phase: "deload" }),
    );
    expect(out.deloadRecommended).toBe(true);
  });

  it("blocked muscle", () => {
    const out = evaluateRecoveryState(
      decision({
        fatigueLevel: "moderate",
        phase: "build",
        muscleRecovery: [
          {
            muscleGroup: "back",
            status: "fatigued",
            recoveryScore: 20,
            weeklySets: 10,
            note: "fatigued",
          },
        ],
      }),
    );
    expect(out.blockedMuscles).toContain("back");
  });
});

