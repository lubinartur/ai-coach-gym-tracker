import type { AdaptiveVolumePlanForAi, AdaptiveVolumePlanMuscleRow } from "@/types/aiCoach";
const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "legs",
  "biceps",
  "triceps",
  "core",
] as const;

export const ADAPTIVE_VOLUME_RANGES: Record<(typeof MUSCLES)[number], { min: number; max: number }> = {
  chest: { min: 10, max: 20 },
  back: { min: 12, max: 22 },
  shoulders: { min: 10, max: 18 },
  legs: { min: 12, max: 20 },
  biceps: { min: 8, max: 16 },
  triceps: { min: 8, max: 16 },
  core: { min: 6, max: 14 },
};

function rowFor(
  muscleGroup: (typeof MUSCLES)[number],
  weeklySets: number,
): AdaptiveVolumePlanMuscleRow {
  const r = ADAPTIVE_VOLUME_RANGES[muscleGroup];
  if (weeklySets < r.min) {
    return {
      muscleGroup,
      weeklySets,
      recommendedRange: [r.min, r.max],
      status: "low",
      action: "increase",
    };
  }
  if (weeklySets > r.max) {
    return {
      muscleGroup,
      weeklySets,
      recommendedRange: [r.min, r.max],
      status: "high",
      action: "reduce",
    };
  }
  return {
    muscleGroup,
    weeklySets,
    recommendedRange: [r.min, r.max],
    status: "optimal",
    action: "maintain",
  };
}

export function buildAdaptiveVolumePlan(input: {
  weeklyMuscleVolume: Record<string, number>;
}): AdaptiveVolumePlanForAi {
  const muscleVolume: AdaptiveVolumePlanMuscleRow[] = MUSCLES.map((m) =>
    rowFor(m, Math.max(0, Math.round((input.weeklyMuscleVolume[m] ?? 0) * 10) / 10)),
  );
  return { muscleVolume };
}

