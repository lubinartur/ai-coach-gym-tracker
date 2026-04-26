import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { MUSCLE_HYPERTROPHY_SETS_PER_WEEK } from "@/lib/muscleVolumeAnalysis";
import type { AdaptiveVolumePlanForAi, AdaptiveVolumePlanMuscleRow } from "@/types/aiCoach";

/**
 * Weekly set bands for the adaptive volume plan use `MUSCLE_HYPERTROPHY_SETS_PER_WEEK` in
 * `muscleVolumeAnalysis` — the single source of truth for AI Coach min/max working sets per
 * week (hypertrophy-oriented; not medical advice). Do not duplicate range tables here.
 */
const VOLUME_PLAN_MUSCLES: PrimaryMuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "legs",
  "biceps",
  "triceps",
  "hamstrings",
  "calves",
  "forearms",
  "core",
];

function rowFor(
  muscleGroup: PrimaryMuscleGroup,
  weeklySets: number,
): AdaptiveVolumePlanMuscleRow {
  const r = MUSCLE_HYPERTROPHY_SETS_PER_WEEK[muscleGroup];
  if (!r) {
    throw new Error(
      `adaptiveVolumeEngine: missing MUSCLE_HYPERTROPHY_SETS_PER_WEEK for ${muscleGroup}`,
    );
  }
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
  const muscleVolume: AdaptiveVolumePlanMuscleRow[] = VOLUME_PLAN_MUSCLES.map((m) =>
    rowFor(
      m,
      Math.max(0, Math.round((input.weeklyMuscleVolume[m] ?? 0) * 10) / 10),
    ),
  );
  return { muscleVolume };
}
