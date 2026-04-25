import { normalizeExerciseName } from "@/lib/exerciseName";

/**
 * Primary muscle bucket for volume tracking (AI Coach & future charts).
 * One group per exercise.
 */
export const PRIMARY_MUSCLE_GROUPS = [
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
  "other",
] as const;

export type PrimaryMuscleGroup = (typeof PRIMARY_MUSCLE_GROUPS)[number];

/**
 * Map a free-form exercise catalog `muscleGroup` string to a primary bucket, if possible.
 */
export function mapCatalogMuscleToPrimary(
  raw: string | undefined,
): PrimaryMuscleGroup | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes("chest") || s.includes("pec")) return "chest";
  if (s.includes("bicep")) return "biceps";
  if (s.includes("tricep")) return "triceps";
  if (s.includes("hamstring") || s.includes("hams")) return "hamstrings";
  if (s.includes("calf")) return "calves";
  if (s.includes("forearm") || s.includes("grip")) return "forearms";
  if (s.includes("core") || s.includes("ab") || s.includes("abs")) return "core";
  if (s.includes("shoulder") || s.includes("delt")) return "shoulders";
  if (s.includes("back") || s.includes("lat")) return "back";
  if (s.includes("leg") || s.includes("quad") || s.includes("glute")) return "legs";
  return null;
}

/**
 * Heuristic primary muscle from exercise name. Prefer `mapCatalogMuscleToPrimary` when
 * the exercise exists in the local catalog.
 */
export function getExerciseMuscleGroup(exerciseName: string): PrimaryMuscleGroup {
  const n = normalizeExerciseName(exerciseName);
  if (!n) return "other";

  // Isolation
  if (n.includes("calf") || n === "calf" || n.includes("soleus")) return "calves";
  if (n.includes("lateral raise") || n.includes("side raise") || n.includes("rear delt") || n.includes("rear deltoid")) {
    return "shoulders";
  }
  if (n.includes("leg curl") || n.includes("hamstring curl") || n.includes("nordic curl")) {
    return "hamstrings";
  }
  if (
    n.includes("romanian") ||
    (n.includes("stiff") && n.includes("leg")) ||
    (n.includes("rdl") && !n.includes("row"))
  ) {
    return "hamstrings";
  }
  if (n.includes("bicep") || (n.includes("curl") && !n.includes("leg") && !n.includes("wrist") && !n.includes("tricep"))) {
    if (n.includes("wrist") && n.includes("curl")) return "forearms";
    if (n.includes("hammer") && n.includes("curl")) return "biceps";
    return "biceps";
  }
  if (n.includes("wrist curl") || n.includes("forearm")) return "forearms";
  if (n.includes("tricep") || n.includes("pushdown") || n.includes("skull") || n.includes("kickback")) {
    return "triceps";
  }
  if (n.includes("crunch") || n.includes("plank") || n.includes("ab ") || n.includes("ab wheel") || n.includes("leg raise") || n.includes("russian twist") || n.includes("pallof")) {
    return "core";
  }

  // Compounds: chest
  if (
    n.includes("bench") ||
    (n.includes("incline") && n.includes("press") && !n.includes("shoulder") && !n.includes("military") && !n.includes("overhead")) ||
    (n.includes("decline") && n.includes("press")) ||
    n.includes("pec deck") ||
    n.includes("pec fly") ||
    n.includes("cable fly") ||
    (n.includes("dumbbell") && n.includes("press") && n.includes("incline")) ||
    (n.includes("chest") && n.includes("press")) ||
    (n.includes("chest") && n.includes("fly")) ||
    n.includes("push-up") ||
    n.includes("pushup")
  ) {
    return "chest";
  }
  if (n.includes("crossover") && n.includes("cable")) return "chest";
  if (n.includes("dip") && (n.includes("chest") || n.includes("parallel") || n.includes("machine"))) {
    return "chest";
  }

  // Shoulders (overhead, machine shoulder press, upright row)
  if (
    n.includes("military") ||
    n.includes("overhead") ||
    n.includes("ohp ") ||
    n.includes(" ohp") ||
    n.startsWith("ohp") ||
    n.includes("shoulder press") ||
    (n.includes("machine") && n.includes("shoulder"))
  ) {
    if (n.includes("bench") || n.includes("incline")) return "chest";
    return "shoulders";
  }
  if (n.includes("upright row")) return "shoulders";
  if (n.includes("arnold") && n.includes("press")) return "shoulders";
  if (n.includes("face pull")) return "shoulders";

  // Back
  if (
    n.includes("pull") ||
    n.includes("chin") ||
    n.includes("pulldown") ||
    n.includes("row") ||
    n.includes("lat bar") ||
    n.includes("pullover") ||
    n.includes("shrug") ||
    n.includes("deadlift") && !n.includes("romanian") && !n.includes("stiff") && !n.includes("trap")
  ) {
    if (n.includes("seated") && n.includes("cable") && n.includes("row") && n.includes("face")) return "shoulders";
    if (n.includes("romanian") || n.includes("rdl")) return "hamstrings";
    if (n.includes("deadlift")) return "back";
    return "back";
  }
  if (n.includes("back") && n.includes("extension")) return "back";
  if (n.includes("hyperextension") || n.includes("reverse hyper")) return "back";

  // Legs
  if (
    n.includes("squat") ||
    n.includes("leg press") ||
    n.includes("lunge") ||
    n.includes("hack squat") ||
    n.includes("leg extension") ||
    n.includes("goblet") ||
    n.includes("v-squat") ||
    n.includes("split squat") ||
    n.includes("sissy") ||
    n.includes("step-up") ||
    n.includes("step up") ||
    n.includes("bulgarian")
  ) {
    return "legs";
  }
  if (n.includes("hip thrust") || n.includes("glute")) return "legs";

  if (n.includes("chest") || n.includes("pec ")) return "chest";
  if (n.includes("shoulder") && !n.includes("bench")) return "shoulders";

  if (n.includes("dumbbell") && n.includes("press") && n.includes("seated")) {
    return "shoulders";
  }
  if (n.includes("fly") && !n.includes("rear")) return "chest";

  return "other";
}
