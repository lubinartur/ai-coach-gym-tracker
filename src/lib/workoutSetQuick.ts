/**
 * Rep / weight adjustments for quick buttons in the exercise set editor.
 */

const WEIGHT_QUANTA = 100;

function roundWeight2(w: number): number {
  if (!Number.isFinite(w) || w < 0) return 0;
  return Math.round(w * WEIGHT_QUANTA) / WEIGHT_QUANTA;
}

/** Bump weight by delta (e.g. ±2.5), clamped to ≥0. */
export function bumpWeightValue(w: number, delta: number): number {
  return roundWeight2(w + delta);
}

/** Integer reps, clamped to ≥0. */
export function bumpRepsValue(reps: number, delta: number): number {
  const r = Number.isFinite(reps) ? Math.round(reps) : 0;
  return Math.max(0, r + delta);
}

export function setVolumeFor(weight: number, reps: number): number {
  return setVolumeForWithMultiplier(weight, reps, 1);
}

/**
 * Canonical set volume.
 * `weight` is always the value the user entered (e.g. per-dumbbell for DB lifts).
 */
export function setVolumeForWithMultiplier(
  weight: number,
  reps: number,
  multiplier: number,
): number {
  const w = Math.max(0, weight || 0);
  const r = Math.max(0, reps || 0);
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return w * r * m;
}
