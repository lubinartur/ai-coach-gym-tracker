
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

