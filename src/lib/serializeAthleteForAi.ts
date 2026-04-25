import type { AthleteProfile } from "@/types/athleteProfile";

/** Strip id/timestamps; only send defined fields to the API. */
export function serializeAthleteProfileForAi(
  p: AthleteProfile,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.sex) out.sex = p.sex;
  if (typeof p.age === "number" && Number.isFinite(p.age)) out.age = p.age;
  if (typeof p.heightCm === "number" && Number.isFinite(p.heightCm)) {
    out.heightCm = p.heightCm;
  }
  if (typeof p.weightKg === "number" && Number.isFinite(p.weightKg)) {
    out.weightKg = p.weightKg;
  }
  if (p.goal) out.goal = p.goal;
  if (p.experience) out.experience = p.experience;
  out.recoveryCapacity = p.recoveryCapacity === "high" ? "high" : "normal";
  if (
    typeof p.trainingDaysPerWeek === "number" &&
    Number.isFinite(p.trainingDaysPerWeek)
  ) {
    out.trainingDaysPerWeek = p.trainingDaysPerWeek;
  }
  if (p.equipment) out.equipment = p.equipment;
  if (p.limitations && p.limitations.length > 0) out.limitations = p.limitations;
  if (p.notes?.trim()) out.notes = p.notes.trim();
  if (p.phase) out.planningPhase = p.phase;
  if (p.offCycleDate?.trim()) out.offCycleDate = p.offCycleDate.trim();
  return out;
}
