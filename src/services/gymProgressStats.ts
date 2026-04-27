import { listExercises } from "@/db/exercises";
import { listWorkoutSessions } from "@/db/workoutSessions";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { buildCatalogLookup, resolveWorkoutExerciseToCatalogExercise } from "@/services/exerciseCatalogResolve";
import type { WorkoutSession } from "@/types/trainingDiary";

export type MostUsedExercise = {
  name: string;
  count: number;
  exerciseId?: string;
};

export type PrHighlight = {
  exerciseName: string;
  weight: number;
  reps: number;
  volume: number;
  date: string;
  sessionId: string;
};

export type GymProgressData = {
  totalWorkouts: number;
  totalSets: number;
  totalVolume: number;
  favorites: { id: string; name: string; muscleGroup?: string }[];
  mostUsed: MostUsedExercise[];
  prHighlights: PrHighlight[];
};

function exerciseVolumeInSession(ex: WorkoutSession["exercises"][number]): number {
  return ex.sets.reduce((s, set) => s + (set.volume ?? 0), 0);
}

export async function getGymProgressData(): Promise<GymProgressData> {
  const sessions = await listWorkoutSessions();
  const catalog = await listExercises();
  const catalogLookup = buildCatalogLookup(catalog);
  const idByNorm = new Map<string, string>();
  for (const e of catalog) {
    const k = normalizeExerciseName(e.name);
    if (k && !idByNorm.has(k)) idByNorm.set(k, e.id);
  }

  const firstNameByKey = new Map<string, string>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const row = resolveWorkoutExerciseToCatalogExercise(ex, catalogLookup);
      const k = normalizeExerciseName(ex.name);
      const stableKey = row?.id ?? (k ? k : ex.id);
      if (stableKey && !firstNameByKey.has(stableKey)) {
        const label =
          (row?.name && row.name.trim()) || ex.name.trim() || ex.name;
        firstNameByKey.set(stableKey, label);
      }
    }
  }

  let totalSets = 0;
  let totalVolume = 0;
  for (const s of sessions) {
    totalSets += s.totalSets;
    totalVolume += s.totalVolume;
  }

  const sessionCount = new Map<string, number>();
  for (const s of sessions) {
    const seenInSession = new Set<string>();
    for (const ex of s.exercises) {
      const row = resolveWorkoutExerciseToCatalogExercise(ex, catalogLookup);
      const k = normalizeExerciseName(ex.name);
      if (!k) continue;
      const key = row?.id ?? k;
      if (seenInSession.has(key)) continue;
      seenInSession.add(key);
      sessionCount.set(key, (sessionCount.get(key) ?? 0) + 1);
    }
  }

  const mostUsed: MostUsedExercise[] = [...sessionCount.entries()]
    .map(([k, count]) => ({
      name: firstNameByKey.get(k) ?? k,
      count,
      exerciseId: catalogLookup.byId.has(k) ? k : idByNorm.get(k),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const prs: PrHighlight[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        const v =
          set.volume ??
          Math.max(0, set.weight) * Math.max(0, set.reps);
        prs.push({
          exerciseName: ex.name,
          weight: set.weight,
          reps: set.reps,
          volume: v,
          date: s.date,
          sessionId: s.id,
        });
      }
    }
  }
  prs.sort((a, b) => b.volume - a.volume);
  const prHighlights = prs.slice(0, 10);

  const favorites = catalog
    .filter((e) => e.isFavorite)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12)
    .map((e) => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscleGroup,
    }));

  return {
    totalWorkouts: sessions.length,
    totalSets,
    totalVolume,
    favorites,
    mostUsed,
    prHighlights,
  };
}

export function formatExerciseLine(
  ex: WorkoutSession["exercises"][number],
): { label: string; setCount: number; vol: number } {
  return {
    label: ex.name || "Exercise",
    setCount: ex.sets.length,
    vol: Math.round(exerciseVolumeInSession(ex) * 100) / 100,
  };
}
