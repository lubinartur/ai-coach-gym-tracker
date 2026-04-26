import { workingSetsOnly } from "@/lib/exerciseWorkingSets";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type { WorkoutSession } from "@/types/trainingDiary";

export type ExerciseProgressionMemoryTrend = {
  lastWeight: number;
  lastReps: number;
  lastSets: number;
  stagnantSessions: number;
  improving: boolean;
  declining: boolean;
};

type Workout = Pick<WorkoutSession, "exercises">;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getWorkingScheme(exSets: { weight: number; reps: number }[]): {
  weight: number;
  reps: number;
  setCount: number;
} | null {
  const working = workingSetsOnly(
    exSets.map((s) => ({
      weight: Math.max(0, Number(s.weight) || 0),
      reps: Math.max(0, Math.round(Number(s.reps) || 0)),
    })),
  );
  if (working.length === 0) return null;

  // Pick a representative “top” working set by volume.
  let best = working[0]!;
  let bestVol = best.weight * best.reps;
  for (const s of working) {
    const v = s.weight * s.reps;
    if (v > bestVol) {
      best = s;
      bestVol = v;
    }
  }
  return { weight: round2(best.weight), reps: Math.round(best.reps), setCount: working.length };
}

/**
 * Lightweight “progression memory” over the last ~3 sessions for a single exercise.
 *
 * NOTE: `exerciseId` is treated as a normalized exercise key (name key).
 * We keep the signature requested, but match via `normalizeExerciseName`.
 */
export function getExerciseProgressionTrend(
  exerciseId: string,
  history: Workout[],
): ExerciseProgressionMemoryTrend {
  const key = normalizeExerciseName(exerciseId);
  const last3: { w: number; r: number; n: number }[] = [];

  // Scan from newest to oldest until we have 3 hits.
  for (let i = history.length - 1; i >= 0; i--) {
    const s = history[i]!;
    const ex = s.exercises.find((e) => normalizeExerciseName(e.name) === key);
    if (!ex) continue;
    const scheme = getWorkingScheme(ex.sets);
    if (!scheme) continue;
    last3.push({ w: scheme.weight, r: scheme.reps, n: scheme.setCount });
    if (last3.length >= 3) break;
  }

  const last = last3[0] ?? { w: 0, r: 0, n: 0 };
  let stagnantSessions = 0;
  let improving = false;
  let declining = false;

  // Compare sequential sessions: last vs prev, prev vs prev2.
  for (let i = 0; i < last3.length - 1; i++) {
    const a = last3[i]!;
    const b = last3[i + 1]!;
    const unchanged = a.w === b.w && a.r === b.r;
    if (unchanged) stagnantSessions += 1;

    // Improving: reps up at same weight and same set count.
    if (a.w === b.w && a.n === b.n && a.r > b.r) improving = true;

    // Declining: reps down (same weight) OR set count reduced.
    if ((a.w === b.w && a.r < b.r) || a.n < b.n) declining = true;
  }

  return {
    lastWeight: last.w,
    lastReps: last.r,
    lastSets: last.n,
    stagnantSessions,
    improving,
    declining,
  };
}

