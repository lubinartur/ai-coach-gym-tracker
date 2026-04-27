import { describe, expect, it } from "vitest";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { EXERCISE_METADATA_V1 } from "@/data/exerciseMetadata";
import { selectWorkoutStructure } from "@/services/exerciseSelectionEngine";
import type { AiDecisionContext } from "@/types/aiCoach";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { RecoveryState } from "@/services/recoveryEngine";
import type { Exercise } from "@/types/trainingDiary";

function pullCatalog(): Exercise[] {
  return EXERCISE_METADATA_V1.map(
    (m) =>
      ({
        id: normalizeExerciseName(m.name) || m.name,
        name: m.name,
        normalizedName: normalizeExerciseName(m.name),
        primaryMuscle: m.primaryMuscleGroup,
        secondaryMuscles: m.secondaryMuscles,
        equipmentTags: m.equipmentTags,
        movementPattern: m.movementPattern,
        roleCompatibility: m.roleCompatibility,
        contraindications: m.contraindications,
        substitutions: m.substitutions,
        source: "metadata",
        isFavorite: false,
        createdAt: "",
        updatedAt: "",
      }) as Exercise,
  );
}

function runtimePull(input: {
  globalFatigueLevel: "low" | "moderate" | "high" | "unknown";
  deloadRecommended: boolean;
  recentWorkoutExerciseNames?: string[];
}) {
  const recentWorkouts =
    input.recentWorkoutExerciseNames?.length
      ? [
          {
            id: "w1",
            date: "2026-04-26",
            title: "Recent",
            createdAt: "2026-04-26T00:00:00.000Z",
            totalSets: 10,
            totalVolume: 1000,
            exercises: input.recentWorkoutExerciseNames.map((name) => ({
              name,
              sets: [{ weight: 1, reps: 1, volume: 1 }],
            })),
          },
        ]
      : [];

  return {
    decision: {
      aiMode: "history_based",
      recentWorkouts,
      exerciseHistory: [],
      fatigueSignals: {
        recentSplitPattern: ["Pull"],
        lastWorkedMuscleGroups: ["back", "biceps", "core"],
        volumeTrend: "stable",
        fatigueSignal: input.globalFatigueLevel,
        exerciseBaselines: [],
      },
      splitContinuityGuard: {
        lastWorkoutSplit: "Push",
        hoursSinceLastWorkout: 24,
        allowSameSplit: false,
        guardActive: true,
        preferredNextSplits: ["Pull", "Legs"],
        reasons: [],
        specializationModeEnabled: false,
      },
      muscleVolume: {
        weeklyMuscleVolume: {} as Record<PrimaryMuscleGroup, number>,
        muscleVolumeTrend: {} as Record<PrimaryMuscleGroup, "up" | "down" | "stable" | "unknown">,
        muscleHypertrophyRanges: {},
      },
      laggingMuscles: {
        muscleProgressScore: {} as Record<PrimaryMuscleGroup, "improving" | "stable" | "stagnating" | "declining" | "unknown">,
        laggingMuscleGroups: [],
        stagnatingExercises: [],
        laggingInterventionBlockers: { highFatigue: false, musclesAtWeeklyVolumeMax: [] },
        muscleProgressHistory: [],
      },
      progressionRecommendations: { exerciseProgression: [] },
      periodizationState: {} as unknown as AiDecisionContext["periodizationState"],
      stimulusScores: [],
      athleteProfile: {},
      trainingSignals: {
        exerciseTrends: [],
        muscleRecovery: [
          { muscleGroup: "back", recoveryScore: 75, status: "ready", weeklySets: 0, note: "" },
          { muscleGroup: "biceps", recoveryScore: 60, status: "moderate", weeklySets: 0, note: "" },
          { muscleGroup: "core", recoveryScore: 60, status: "moderate", weeklySets: 0, note: "" },
          { muscleGroup: "shoulders", recoveryScore: 60, status: "moderate", weeklySets: 0, note: "" },
        ],
        fatigueTrend: { level: input.globalFatigueLevel, reasons: [] },
        progressionFocus: "maintain",
        alerts: [],
      },
      progressionPlan: { globalStrategy: "maintain", exercisePlans: [] },
      trainingPhase: { phase: "build", weekInPhase: 1, reason: "", fatigueIndicator: "moderate", volumeIndicator: "moderate" },
      volumePlan: { muscleVolume: [] },
      splitSelection: {
        recommendedSplit: "Pull",
        candidates: [],
        reason: "test",
      },
    },
    recovery: {
      globalFatigueLevel: input.globalFatigueLevel,
      deloadRecommended: input.deloadRecommended,
      muscles: {
        back: { status: "ready", recoveryScore: 75 },
        biceps: { status: "moderate", recoveryScore: 60 },
        core: { status: "moderate", recoveryScore: 60 },
        shoulders: { status: "moderate", recoveryScore: 60 },
      } as unknown as RecoveryState["muscles"],
      blockedMuscles: [],
      volumeCappedMuscles: [],
      rules: {
        compoundMinRecoveryScore: 70,
        isolationMinRecoveryScore: 40,
        heavyBlockRecoveryScore: 40,
        deloadVolumeMultiplier: 0.6,
      },
    },
    trace: { traceId: "test-trace", entries: [] },
    now: 0,
  } as unknown as EngineRuntimeContext;
}

describe("ExerciseSelectionEngine.selectWorkoutStructure", () => {
  it("normal Pull selection uses metadata", () => {
    const structure = selectWorkoutStructure({
      runtime: runtimePull({
        globalFatigueLevel: "moderate",
        deloadRecommended: false,
      }),
      catalog: pullCatalog(),
      constraints: {},
    });

    expect(structure.split).toBe("Pull");

    const roles = new Set(structure.exercises.map((e) => e.role));
    expect(roles).toEqual(
      new Set([
        "vertical_pull",
        "horizontal_pull",
        "secondary_back",
        "rear_delt",
        "biceps",
        "core",
      ]),
    );

    const normNames = structure.exercises
      .map((e) => normalizeExerciseName(e.exercise))
      .filter(Boolean);
    expect(new Set(normNames).size).toBe(normNames.length);

    for (const ex of structure.exercises) {
      expect(ex.reasonCodes).toContain("metadata_role_match");
      expect(ex.reasonCodes).toContain("metadata_equipment");
    }
  });

  it("high fatigue prefers lower-stress substitutions", () => {
    const structure = selectWorkoutStructure({
      runtime: runtimePull({
        globalFatigueLevel: "high",
        deloadRecommended: false,
        recentWorkoutExerciseNames: ["Barbell Row"],
      }),
      catalog: pullCatalog(),
      constraints: { rotationWindowSessions: 2 },
    });

    const selectedNames = structure.exercises.map((e) => e.exercise);
    expect(selectedNames).not.toContain("Barbell Row");

    const rowPick =
      structure.exercises.find((e) => e.role === "horizontal_pull") ??
      structure.exercises.find((e) => e.role === "secondary_back");
    expect(rowPick).toBeTruthy();

    const reasons = rowPick!.reasonCodes;
    expect(
      reasons.includes("stress_bias_high_fatigue") ||
        reasons.includes("rotation_substitution") ||
        reasons.includes("fatigue_substitution"),
    ).toBe(true);
  });
});

