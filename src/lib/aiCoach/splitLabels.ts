/**
 * Shared heuristics for post-processing AI suggest-next output (not the same as
 * `workoutSplitInference` session classification).
 *
 * `muscleBucket` merges the former server (primaryMuscleBucket) and quality-check
 * implementations. The main behavioral difference: exercises whose name matches
 * `calf` are classified as `"calves"` (quality) instead of often falling through
 * to `"other"` on the old server, which only tested arms/legs/… without a calf line.
 */
export type NormalizedSplitLabel = "push" | "pull" | "legs" | "full" | "unknown";

export function normalizeSplitLabel(
  input?: string | null,
): NormalizedSplitLabel {
  const t = (input ?? "").toLowerCase();
  if (t.includes("push")) return "push";
  if (t.includes("pull")) return "pull";
  if (t.includes("legs") || t.includes("leg")) return "legs";
  if (t.includes("full")) return "full";
  return "unknown";
}

export type MuscleBucket =
  | "back"
  | "legs"
  | "chest"
  | "shoulders"
  | "arms"
  | "calves"
  | "other";

/**
 * Coarse group from a free-text exercise name (English-oriented regexes).
 * See module comment: prefers the quality-check ordering (`calf` before broad `legs` patterns).
 */
export function muscleBucket(input?: string | null): MuscleBucket {
  const s = (input ?? "").toLowerCase();
  if (!s) return "other";
  if (/calf/.test(s)) return "calves";
  if (/row|pulldown|pull[-\s]?up|lat|deadlift|back/.test(s)) return "back";
  if (/squat|leg|lunge|quad|ham|string|rdl/.test(s)) return "legs";
  if (/bench|press|fly|chest/.test(s)) return "chest";
  if (/shoulder|ohp|overhead|raise|delt/.test(s)) return "shoulders";
  if (/curl|tricep|bicep|arm/.test(s)) return "arms";
  return "other";
}
