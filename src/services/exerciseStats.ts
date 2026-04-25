import {
  getLibraryItemByName,
  MUSCLE_GROUP_CANONICAL,
} from "@/data/exerciseLibrary";
import { db } from "@/db/database";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type { Exercise, WorkoutExercise, WorkoutSession, WorkoutSet } from "@/types/trainingDiary";

export { normalizeExerciseName };

export type ExerciseSessionUse = {
  sessionId: string;
  date: string;
  title: string;
  sets: { weight: number; reps: number; volume: number }[];
  volume: number;
};

export async function getExerciseHistory(
  exerciseName: string,
  limit = 50,
): Promise<ExerciseSessionUse[]> {
  const key = normalizeExerciseName(exerciseName);
  if (!key) return [];

  const sessions = await db.workoutSessions.orderBy("date").reverse().toArray();
  const uses: ExerciseSessionUse[] = [];

  for (const s of sessions) {
    const match = findMatchingExerciseInSession(s, key);
    if (!match) continue;
    const sets = match.sets.map((set) => ({
      weight: set.weight,
      reps: set.reps,
      volume: Math.max(0, set.weight) * Math.max(0, set.reps),
    }));
    const volume = sets.reduce((sum, x) => sum + x.volume, 0);
    uses.push({
      sessionId: s.id,
      date: s.date,
      title: s.title,
      sets,
      volume,
    });
    if (uses.length >= limit) break;
  }

  return uses;
}

export async function getLastExercisePerformance(
  exerciseName: string,
): Promise<ExerciseSessionUse | null> {
  const history = await getExerciseHistory(exerciseName, 1);
  return history[0] ?? null;
}

export type ExerciseStats = {
  normalizedName: string;
  bestSet?: { weight: number; reps: number; volume: number };
  totalVolume: number;
  /** All sets across all sessions for this exercise. */
  totalSets: number;
  last5: ExerciseSessionUse[];
};

export async function getExerciseStats(
  exerciseName: string,
): Promise<ExerciseStats> {
  const normalizedName = normalizeExerciseName(exerciseName);
  const history = await getExerciseHistory(exerciseName, 50);

  let best: { weight: number; reps: number; volume: number } | undefined;
  let totalVolume = 0;
  let totalSets = 0;

  for (const h of history) {
    totalVolume += h.volume;
    totalSets += h.sets.length;
    for (const s of h.sets) {
      const cand = { weight: s.weight, reps: s.reps, volume: s.volume };
      if (!best) {
        best = cand;
        continue;
      }
      if (
        cand.volume > best.volume ||
        (cand.volume === best.volume && cand.weight > best.weight) ||
        (cand.volume === best.volume &&
          cand.weight === best.weight &&
          cand.reps > best.reps)
      ) {
        best = cand;
      }
    }
  }

  return {
    normalizedName,
    bestSet: best,
    totalVolume,
    totalSets,
    last5: history.slice(0, 5),
  };
}

function findMatchingExerciseInSession(
  session: WorkoutSession,
  normalizedName: string,
): WorkoutExercise | undefined {
  return session.exercises.find(
    (ex) => normalizeExerciseName(ex.name) === normalizedName,
  );
}

export function formatSet(set: Pick<WorkoutSet, "weight" | "reps">): string {
  return `${set.weight} × ${set.reps}`;
}

/** Last N unique exercise names by recency across saved sessions. */
export async function getRecentExerciseNamesUsed(limit = 5): Promise<string[]> {
  const sessions = await db.workoutSessions.orderBy("createdAt").reverse().toArray();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const raw = ex.name?.trim();
      if (!raw) continue;
      const k = normalizeExerciseName(raw);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(raw);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Map stored/legacy labels to a canonical lower-case muscle id. */
const MUSCLE_GROUP_ALIASES: Record<string, string> = {
  chest: "chest",
  back: "back",
  shoulders: "shoulders",
  shoulder: "shoulders",
  biceps: "biceps",
  bicep: "biceps",
  triceps: "triceps",
  tricep: "triceps",
  core: "abs",
  ab: "abs",
  abs: "abs",
  abdominals: "abs",
  glutes: "glutes",
  glute: "glutes",
  legs: "legs",
  quads: "quads",
  hamstrings: "hamstrings",
  calfs: "calves",
  calf: "calves",
  cardio: "cardio",
  "full body": "full_body",
  fullbody: "full_body",
  full_body: "full_body",
};

export function mapMuscleGroupStringToCanonical(
  raw: string | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim().toLowerCase();
  if (!t) return undefined;
  const fromAlias = MUSCLE_GROUP_ALIASES[t];
  if (fromAlias) {
    if (MUSCLE_GROUP_CANONICAL.has(fromAlias)) return fromAlias;
  }
  if (MUSCLE_GROUP_CANONICAL.has(t)) return t;
  return undefined;
}

/**
 * Resolves a single canonical muscle id (lowercase) from stored fields and library
 * (handles legacy casing, "Core" → abs, and library name match).
 */
export function resolveCanonicalMuscleForExercise(e: Exercise): string | undefined {
  const fromField = mapMuscleGroupStringToCanonical(e.muscleGroup);
  if (fromField) return fromField;
  return getLibraryItemByName(e.name)?.muscleGroup;
}

/**
 * Picker category tabs: primary muscle only (`exercise.muscleGroup` resolved, else
 * library `muscleGroup`). `secondaryMuscles` in the catalog are not used here.
 */
/** Picker muscle category id (maps to primary canonical muscle and/or name heuristics for full body). */
export function exerciseMatchesPickerCategory(
  e: Exercise,
  categoryId: string,
): boolean {
  const cat = String(categoryId).trim().toLowerCase();
  const n = (e.name || "").trim().toLowerCase();
  const mg = resolveCanonicalMuscleForExercise(e) ?? "";
  const legsGroups = new Set([
    "legs",
    "quads",
    "hamstrings",
    "calves",
    "glutes",
  ]);
  const fullBodyNameHints = [
    "deadlift",
    "kettlebell swing",
    "farmer",
    "sled",
    "burpee",
    "clean",
    "snatch",
    "jerk",
    "thruster",
    "trap bar",
    "sumo",
    "assault",
    "rower",
    "jump rope",
    "treadmill",
    "elliptical",
    "stair climb",
    "good morning",
    "swing",
  ];
  switch (cat) {
    case "chest":
      return mg === "chest";
    case "back":
      return mg === "back";
    case "shoulders":
      return mg === "shoulders";
    case "biceps":
      return mg === "biceps";
    case "triceps":
      return mg === "triceps";
    case "glutes":
      return mg === "glutes";
    case "core":
      return mg === "abs";
    case "legs":
      return legsGroups.has(mg);
    case "full_body": {
      if (mg === "full_body") return true;
      return fullBodyNameHints.some((h) => n.includes(h));
    }
    default:
      return false;
  }
}

