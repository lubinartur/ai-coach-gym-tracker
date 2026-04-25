/**
 * Pre-computes per-exercise progression context from recent workout history
 * for AI Coach (suggest next workout). Does not persist; no DB changes.
 */

import { workingSetsOnly } from "@/lib/exerciseWorkingSets";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type { WorkoutSession } from "@/types/trainingDiary";
import type {
  ExerciseProgressionForAiBase,
  ExerciseProgressionTrend,
} from "@/types/aiCoach";

const MAX_TRAIN = 5;
const MAX_EXERCISES = 24;

type LogSet = { weight: number; reps: number; volume: number };

function median(nums: number[]): number {
  if (nums.length === 0) return 8;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor((a.length - 1) / 2);
  if (a.length % 2 === 1) return a[m]!;
  return (a[m]! + a[m + 1]!) / 2;
}

/** Infer a sensible rep band from recent working-set reps. */
function inferRepTargetRange(workingReps: number[]): { min: number; max: number } {
  if (workingReps.length === 0) return { min: 8, max: 12 };
  const m = Math.round(median(workingReps));
  if (m <= 4) return { min: 3, max: 5 };
  if (m <= 7) return { min: 5, max: 8 };
  if (m <= 10) return { min: 8, max: 12 };
  if (m <= 15) return { min: 10, max: 15 };
  return { min: 12, max: 20 };
}

function toLogSets(sets: WorkoutSession["exercises"][0]["sets"]): LogSet[] {
  return sets.map((st) => {
    const w = Math.max(0, st.weight);
    const r = Math.max(0, Math.round(st.reps));
    return {
      weight: w,
      reps: r,
      volume: st.volume ?? w * r,
    };
  });
}

function topSet(sets: LogSet[]): { w: number; r: number; vol: number } {
  if (sets.length === 0) return { w: 0, r: 0, vol: 0 };
  let best = sets[0]!;
  for (const s of sets) {
    if (s.volume > best.volume) best = s;
  }
  return { w: best.weight, r: best.reps, vol: best.volume };
}

function repDropFirstToLast(ordered: LogSet[]): number {
  if (ordered.length < 2) return 0;
  return ordered[0]!.reps - ordered[ordered.length - 1]!.reps;
}

function sessionInFatigue(orderedInRange: LogSet[]): boolean {
  if (orderedInRange.length < 2) return false;
  if (repDropFirstToLast(orderedInRange) > 3) return true;
  for (let i = 0; i < orderedInRange.length - 1; i++) {
    if (orderedInRange[i]!.reps - orderedInRange[i + 1]!.reps > 3) return true;
  }
  return false;
}

function sameTop(
  a: { topW: number; topR: number },
  b: { topW: number; topR: number },
): boolean {
  return (
    Math.abs(a.topW - b.topW) < 0.25 && Math.abs(a.topR - b.topR) < 0.51
  );
}

function computeTrend(
  hist: { topW: number; topR: number }[],
): { trend: ExerciseProgressionTrend; stagnationSessions: number } {
  if (hist.length < 2) {
    return { trend: "unknown", stagnationSessions: 0 };
  }

  const n = hist.length;
  const last = hist[n - 1]!;
  const prev = hist[n - 2]!;

  // Declining: reps down two steps in a row (chronological)
  if (n >= 3) {
    const a = hist[n - 3]!;
    if (last.topR < prev.topR && prev.topR < a.topR) {
      return { trend: "declining", stagnationSessions: 0 };
    }
  }
  if (n >= 2 && last.topR < prev.topR - 0.1 && last.topW <= prev.topW + 0.25) {
    return { trend: "declining", stagnationSessions: 0 };
  }

  // Stagnation: last 3 identical top sets
  if (n >= 3) {
    const t0 = hist[n - 1]!;
    const t1 = hist[n - 2]!;
    const t2 = hist[n - 3]!;
    if (
      sameTop(t0, t1) &&
      sameTop(t1, t2) &&
      t0.topW > 0
    ) {
      return { trend: "stagnating", stagnationSessions: 3 };
    }
  }

  // Improving: last step up in weight or reps
  if (
    last.topW > prev.topW + 0.1 ||
    (Math.abs(last.topW - prev.topW) < 0.25 && last.topR > prev.topR + 0.1)
  ) {
    return { trend: "improving", stagnationSessions: 0 };
  }

  // stable
  if (sameTop(last, prev) || (Math.abs(last.topW - prev.topW) < 0.25 && Math.abs(last.topR - prev.topR) < 0.51)) {
    return { trend: "stable", stagnationSessions: sameTop(last, prev) ? 2 : 0 };
  }

  return { trend: "stable", stagnationSessions: 0 };
}

function buildHint(
  name: string,
  trend: ExerciseProgressionTrend,
  repR: { min: number; max: number },
  lastFatigue: boolean,
  volDrop2: boolean,
): string {
  const r = `${repR.min}–${repR.max} rep target (working sets in range).`;
  if (lastFatigue || volDrop2) {
    return `${name}: trend ${trend}. ${r} Fatigue/volume risk — do not add load or sets until execution steadies.`;
  }
  if (trend === "stagnating") {
    return `${name}: ${trend} (3+ similar top sets). ${r} Consider +reps, small +weight, or +1 set if fatigue is low.`;
  }
  if (trend === "improving") {
    return `${name}: ${trend}. ${r} Keep single-variable progression.`;
  }
  if (trend === "declining") {
    return `${name}: ${trend} (reps/load slipping). ${r} Reduce stress or address recovery before pushing volume.`;
  }
  return `${name}: ${trend}. ${r} Progress one variable at a time.`;
}

function oneExercise(
  displayName: string,
  key: string,
  sessions: WorkoutSession[],
): ExerciseProgressionForAiBase | null {
  const poolReps: number[] = [];
  const chronological: {
    date: string;
    sessionId: string;
    topW: number;
    topR: number;
    workingVolume: number;
    inTargetSets: number;
    inSessionRepDrop: number;
    inSessionFatigue: boolean;
  }[] = [];

  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i]!;
    const ex = s.exercises.find((e) => normalizeExerciseName(e.name) === key);
    if (!ex) continue;
    const raw = toLogSets(ex.sets);
    const working = workingSetsOnly(
      raw.map((x) => ({ weight: x.weight, reps: x.reps })),
    ).map((x) => {
      const full = raw.find(
        (r) =>
          Math.abs(r.weight - x.weight) < 0.01 &&
          Math.round(r.reps) === Math.round(x.reps),
      );
      return full ?? { ...x, volume: x.weight * x.reps };
    });
    for (const w of working) {
      poolReps.push(w.reps);
    }
  }

  const repTarget = inferRepTargetRange(poolReps);

  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i]!;
    const ex = s.exercises.find((e) => normalizeExerciseName(e.name) === key);
    if (!ex) continue;
    const raw = toLogSets(ex.sets);
    const working = workingSetsOnly(
      raw.map((x) => ({ weight: x.weight, reps: x.reps })),
    ).map((x) => {
      const full = raw.find(
        (r) =>
          Math.abs(r.weight - x.weight) < 0.01 &&
          Math.round(r.reps) === Math.round(x.reps),
      );
      return full ?? { weight: x.weight, reps: x.reps, volume: x.weight * x.reps };
    });
    if (working.length === 0) continue;

    const inRange = working.filter(
      (x) => x.reps >= repTarget.min && x.reps <= repTarget.max,
    );
    const use = inRange.length > 0 ? inRange : working;
    const top = topSet(use);
    const workingVolume = use.reduce((sum, st) => sum + st.volume, 0);
    const ordered = [...use].sort((a, b) => {
      const ia = ex.sets.findIndex(
        (st) =>
          Math.abs(st.weight - a.weight) < 0.01 &&
          Math.round(st.reps) === a.reps,
      );
      const ib = ex.sets.findIndex(
        (st) =>
          Math.abs(st.weight - b.weight) < 0.01 &&
          Math.round(st.reps) === b.reps,
      );
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    const drop = repDropFirstToLast(ordered);
    const fatigue = sessionInFatigue(ordered);

    chronological.push({
      date: s.date,
      sessionId: s.id,
      topW: top.w,
      topR: top.r,
      workingVolume,
      inTargetSets: use.length,
      inSessionRepDrop: drop,
      inSessionFatigue: fatigue,
    });
  }

  if (chronological.length === 0) return null;

  const histForTrend = chronological.map((c) => ({ topW: c.topW, topR: c.topR }));
  const { trend, stagnationSessions } = computeTrend(histForTrend);

  const lastS = chronological[chronological.length - 1]!;
  let volDrop2 = false;
  if (chronological.length >= 3) {
    const a = chronological[chronological.length - 1]!.workingVolume;
    const b = chronological[chronological.length - 2]!.workingVolume;
    const c2 = chronological[chronological.length - 3]!.workingVolume;
    if (a < b && b < c2) volDrop2 = true;
  }

  const fatigueDetected = lastS.inSessionFatigue || volDrop2;

  return {
    name: displayName,
    repTargetRange: repTarget,
    history: chronological.map((c) => ({
      date: c.date,
      sessionId: c.sessionId,
      topWeight: c.topW,
      topReps: c.topR,
      workingVolume: Math.round(c.workingVolume * 100) / 100,
      inRepTargetWorkingSets: c.inTargetSets,
      inSessionRepDrop: c.inSessionRepDrop,
      inSessionFatigue: c.inSessionFatigue,
    })),
    trend,
    stagnationSessions,
    fatigueDetected,
    volumeFalling3Sessions: volDrop2,
    hint: buildHint(displayName, trend, repTarget, lastS.inSessionFatigue, volDrop2),
  };
}

/**
 * Newest sessions first in `rows` (as from listWorkoutSessions).
 * Returns compact progression rows for the AI payload (oldest history entries first per exercise).
 */
export function buildExerciseProgressionForAi(
  rows: WorkoutSession[],
): ExerciseProgressionForAiBase[] {
  const slice = rows.slice(0, MAX_TRAIN);
  if (slice.length === 0) return [];

  const latest = slice[0]!;
  const keysOrdered: string[] = [];
  for (const ex of latest.exercises) {
    const k = normalizeExerciseName(ex.name);
    if (k && !keysOrdered.includes(k)) keysOrdered.push(k);
  }
  for (const s of slice) {
    for (const ex of s.exercises) {
      const k = normalizeExerciseName(ex.name);
      if (k && !keysOrdered.includes(k) && keysOrdered.length < MAX_EXERCISES) {
        keysOrdered.push(k);
      }
    }
  }
  if (keysOrdered.length > MAX_EXERCISES) {
    keysOrdered.length = MAX_EXERCISES;
  }

  const out: ExerciseProgressionForAiBase[] = [];
  for (const key of keysOrdered) {
    const display =
      latest.exercises.find((e) => normalizeExerciseName(e.name) === key)
        ?.name ?? key;
    const row = oneExercise(display, key, slice);
    if (row) out.push(row);
  }
  return out;
}
