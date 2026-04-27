export type OneRepMaxFormula = "epley" | "brzycki";

export type StrengthSetLike = {
  weight: number;
  reps: number;
  /**
   * Optional warm-up flags from older/alternate set encodings.
   * (WorkoutSet currently does not include these, but callers may.)
   */
  isWarmup?: boolean;
  is_warmup?: boolean;
  /**
   * Optional bodyweight hint. If true and weight <= 0, treat as bodyweight-only.
   */
  bodyweight?: boolean;
};

export type OneRepMaxEstimate = {
  estimated1RM: number;
  formula: OneRepMaxFormula;
  source: { weight: number; reps: number };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estimateOneRepMax(input: {
  weight: number;
  reps: number;
  formula?: OneRepMaxFormula;
}): number | null {
  const w = Number(input.weight);
  const r = Math.round(Number(input.reps));
  if (!Number.isFinite(w) || !Number.isFinite(r)) return null;
  if (w <= 0 || r <= 0) return null;

  const formula: OneRepMaxFormula = input.formula ?? "epley";

  if (formula === "epley") {
    // Epley: 1RM = w * (1 + reps/30)
    return round2(w * (1 + r / 30));
  }

  // Brzycki: 1RM = w * 36 / (37 - reps)
  // Valid only when reps < 37.
  if (r >= 37) return null;
  const denom = 37 - r;
  if (denom <= 0) return null;
  return round2((w * 36) / denom);
}

export function isValidStrengthSet(
  set: StrengthSetLike,
  options?: {
    /** Default: 12 */
    repsMax?: number;
  },
): boolean {
  const w = Number(set.weight);
  const r = Math.round(Number(set.reps));
  if (!Number.isFinite(w) || !Number.isFinite(r)) return false;
  if (w <= 0 || r <= 0) return false;

  const repsMax = Math.max(1, Math.floor(options?.repsMax ?? 12));
  if (r > repsMax) return false;

  const warmupFlag = Boolean(set.isWarmup || set.is_warmup);
  if (warmupFlag) return false;

  // Ignore bodyweight-only for now unless an external load exists.
  // If callers mark bodyweight sets but still provide weight > 0 (e.g. belt), allow.
  if (set.bodyweight && w <= 0) return false;

  return true;
}

export function getBestEstimatedOneRepMaxFromSets(
  sets: StrengthSetLike[],
  options?: {
    formula?: OneRepMaxFormula;
    /** Default: 12 */
    repsMax?: number;
  },
): OneRepMaxEstimate | null {
  if (!Array.isArray(sets) || sets.length === 0) return null;
  const formula: OneRepMaxFormula = options?.formula ?? "epley";

  let best: OneRepMaxEstimate | null = null;
  for (const s of sets) {
    if (!isValidStrengthSet(s, { repsMax: options?.repsMax })) continue;
    const est = estimateOneRepMax({ weight: s.weight, reps: s.reps, formula });
    if (est == null || !Number.isFinite(est) || est <= 0) continue;
    const cand: OneRepMaxEstimate = {
      estimated1RM: est,
      formula,
      source: { weight: Number(s.weight), reps: Math.round(Number(s.reps)) },
    };
    if (!best || cand.estimated1RM > best.estimated1RM) best = cand;
  }
  return best;
}

