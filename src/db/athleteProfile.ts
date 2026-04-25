import { db } from "./database";
import type { AthleteProfile, AthleteTrainingGoal } from "@/types/athleteProfile";
import type { TrainingPhase } from "@/types/trainingShared";

export const ATHLETE_PROFILE_ID = "default" as const;

const GOALS: AthleteTrainingGoal[] = [
  "build_muscle",
  "lose_fat",
  "recomposition",
  "strength",
  "general_fitness",
];

const LEGACY_AUTO_POST_CYCLE = {
  phase: "post_cycle" as const,
  goal: "maintain strength and recover",
  notes: "avoid aggressive progression for several weeks",
};

function now(): string {
  return new Date().toISOString();
}

function isLegacyAutoPostCycle(r: Record<string, unknown>): boolean {
  return (
    r.phase === LEGACY_AUTO_POST_CYCLE.phase &&
    r.goal === LEGACY_AUTO_POST_CYCLE.goal &&
    r.notes === LEGACY_AUTO_POST_CYCLE.notes
  );
}

function normalizeGymGoal(
  raw: unknown,
  notes: string | undefined,
): { goal?: AthleteTrainingGoal; notes?: string } {
  if (typeof raw === "string" && (GOALS as string[]).includes(raw)) {
    return { goal: raw as AthleteTrainingGoal, notes };
  }
  if (typeof raw === "string" && raw.trim()) {
    return {
      notes: notes
        ? `Previous goal: ${raw}. ${notes}`
        : `Previous goal: ${raw}.`,
    };
  }
  return { notes };
}

function rowToProfile(raw: unknown): AthleteProfile {
  const r = raw as Record<string, unknown>;
  const ts = now();
  const { goal, notes: n2 } = normalizeGymGoal(
    r.goal,
    typeof r.notes === "string" ? r.notes : undefined,
  );
  return {
    id: ATHLETE_PROFILE_ID,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : ts,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : ts,
    onboardingCompleted:
      r.onboardingCompleted === true
        ? true
        : r.onboardingCompleted === false
          ? false
          : undefined,
    phase: r.phase as TrainingPhase | undefined,
    offCycleDate: typeof r.offCycleDate === "string" ? r.offCycleDate : undefined,
    sex: r.sex as AthleteProfile["sex"] | undefined,
    age: typeof r.age === "number" && Number.isFinite(r.age) ? r.age : undefined,
    heightCm:
      typeof r.heightCm === "number" && Number.isFinite(r.heightCm)
        ? r.heightCm
        : undefined,
    weightKg:
      typeof r.weightKg === "number" && Number.isFinite(r.weightKg)
        ? r.weightKg
        : undefined,
    goal,
    experience: r.experience as AthleteProfile["experience"] | undefined,
    recoveryCapacity:
      r.recoveryCapacity === "high" || r.recoveryCapacity === "normal"
        ? r.recoveryCapacity
        : undefined,
    trainingDaysPerWeek:
      typeof r.trainingDaysPerWeek === "number" &&
      Number.isFinite(r.trainingDaysPerWeek)
        ? r.trainingDaysPerWeek
        : undefined,
    equipment: r.equipment as AthleteProfile["equipment"] | undefined,
    limitations: Array.isArray(r.limitations)
      ? (r.limitations as string[]).filter((x) => typeof x === "string")
      : undefined,
    notes: n2,
  };
}

export async function getOrCreateAthleteProfile(): Promise<AthleteProfile> {
  const row = await db.athleteProfiles.get(ATHLETE_PROFILE_ID);
  if (row) {
    const raw = row as unknown as Record<string, unknown>;
    let p = rowToProfile(row);
    if (isLegacyAutoPostCycle(raw)) {
      p = {
        ...p,
        phase: "natural",
        notes: undefined,
        offCycleDate: undefined,
        goal: "recomposition",
        updatedAt: now(),
      };
      await db.athleteProfiles.put(p);
    }
    if (p.onboardingCompleted === undefined) {
      p = { ...p, onboardingCompleted: true, updatedAt: now() };
      await db.athleteProfiles.put(p);
    }
    return p;
  }
  const created: AthleteProfile = {
    id: ATHLETE_PROFILE_ID,
    createdAt: now(),
    updatedAt: now(),
    phase: "natural",
    onboardingCompleted: false,
  };
  await db.athleteProfiles.put(created);
  return created;
}

export async function saveAthleteProfile(
  patch: Partial<Omit<AthleteProfile, "id" | "createdAt">>,
): Promise<void> {
  const current = await getOrCreateAthleteProfile();
  const updatedAt = now();
  await db.athleteProfiles.put({
    ...current,
    ...patch,
    id: ATHLETE_PROFILE_ID,
    createdAt: current.createdAt,
    updatedAt,
  });
}

export function isOnboardingComplete(p: AthleteProfile): boolean {
  return p.onboardingCompleted === true;
}
