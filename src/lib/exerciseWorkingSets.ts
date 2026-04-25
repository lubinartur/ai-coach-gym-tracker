/**
 * Classify working vs warm-up sets in a single exercise session and pick
 * a sensible "previous" set to compare to a planned (target) set.
 */

export type LoggedSet = { weight: number; reps: number };

const FR_HEAVIEST = 0.6;
const FR_MUCH_HEAVIER_LATER = 0.4;

/**
 * Heaviest weight in the session; used to flag sets clearly below that ceiling.
 */
function sessionMaxWeight(sets: LoggedSet[]): number {
  if (sets.length === 0) return 0;
  return Math.max(0, ...sets.map((s) => s.weight));
}

/**
 * For each index i, max weight in sets with index > i (0 if i is last).
 */
function maxWeightAfter(sets: LoggedSet[]): number[] {
  const n = sets.length;
  const out: number[] = new Array(n).fill(0);
  let suffix = 0;
  for (let i = n - 1; i >= 0; i--) {
    out[i] = suffix;
    const w = Math.max(0, sets[i]!.weight);
    suffix = Math.max(suffix, w);
  }
  return out;
}

/**
 * Warm-up if: weight is below 60% of the session heaviest, OR there is a
 * substantially heavier set later and this load is a small fraction of that
 * (ramp) — e.g. 20×15 before 125 without catching 100×3 as ramp if 100 is
 * already a large share of the heavier later 125.
 */
export function isWarmupSet(
  s: LoggedSet,
  wMax: number,
  maxLater: number,
): boolean {
  const w = Math.max(0, s.weight);
  if (wMax > 0 && w < FR_HEAVIEST * wMax) return true;
  if (maxLater > 0 && w < FR_MUCH_HEAVIER_LATER * maxLater) return true;
  return false;
}

export function warmUpMask(sets: LoggedSet[]): boolean[] {
  const wMax = sessionMaxWeight(sets);
  const after = maxWeightAfter(sets);
  return sets.map((s, i) => isWarmupSet(s, wMax, after[i]!));
}

export function workingSetsOnly(sets: LoggedSet[]): LoggedSet[] {
  const mask = warmUpMask(sets);
  return sets.filter((_, i) => !mask[i]);
}

type Scored = { w: number; r: number; dRep: number };

/**
 * From working sets, pick the best "previous" row to pair with a planned
 * (target) set: closest rep count, then heaviest weight.
 */
export function pickWorkingSetForComparison(
  allSets: LoggedSet[],
  targetWeight: number,
  targetReps: number,
): LoggedSet | null {
  if (allSets.length === 0) return null;
  let working = workingSetsOnly(allSets);
  if (working.length === 0) {
    // Degenerate: treat heaviest by weight as the anchor
    working = [...allSets].sort((a, b) => b.weight - a.weight);
    if (working.length) return { ...working[0]! };
    return null;
  }

  const tw = Math.max(0, targetWeight);
  const tr = Math.max(0, Math.round(targetReps));
  const scored: Scored[] = working.map((s) => {
    const w = Math.max(0, s.weight);
    const r = Math.max(0, Math.round(s.reps));
    return { w, r, dRep: Math.abs(r - tr) };
  });
  scored.sort((a, b) => {
    if (a.dRep !== b.dRep) return a.dRep - b.dRep;
    if (a.w !== b.w) return b.w - a.w;
    const da = Math.abs(a.w - tw);
    const db = Math.abs(b.w - tw);
    if (da !== db) return da - db;
    return b.r - a.r;
  });
  const k = scored[0]!;
  return { weight: k.w, reps: k.r };
}

/**
 * True if (w,r) matches a logged set that is classified as warm-up.
 * If no exact match, returns false.
 */
export function isSessionSetWarmup(
  sets: LoggedSet[],
  w: number,
  r: number,
): boolean {
  const mask = warmUpMask(sets);
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i]!;
    if (Math.abs(s.weight - w) < 0.01 && Math.round(s.reps) === Math.round(r)) {
      return mask[i]!;
    }
  }
  return false;
}
