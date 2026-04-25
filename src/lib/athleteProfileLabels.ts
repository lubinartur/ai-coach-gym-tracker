import type { AthleteEquipment, AthleteExperience, AthleteProfile, AthleteTrainingGoal } from "@/types/athleteProfile";

const GOAL: Record<AthleteTrainingGoal, string> = {
  build_muscle: "Build muscle",
  lose_fat: "Lose fat",
  recomposition: "Recomposition",
  strength: "Strength",
  general_fitness: "General fitness",
};

const EXP: Record<AthleteExperience, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const EQ: Record<AthleteEquipment, string> = {
  commercial_gym: "Commercial gym",
  home_gym: "Home gym",
  bodyweight: "Bodyweight",
};

export function formatTrainingGoalLabel(g?: AthleteTrainingGoal): string {
  return g ? GOAL[g] : "—";
}

export function formatExperienceLabel(e?: AthleteExperience): string {
  return e ? EXP[e] : "—";
}

export function formatEquipmentLabel(x?: AthleteEquipment): string {
  return x ? EQ[x] : "—";
}

export function formatAthleteGoalForPlan(p: AthleteProfile): string {
  return p.goal ? GOAL[p.goal] : "";
}
