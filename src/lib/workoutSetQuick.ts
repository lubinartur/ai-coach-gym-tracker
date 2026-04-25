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
  return Math.max(0, weight || 0) * Math.max(0, reps || 0);
}
