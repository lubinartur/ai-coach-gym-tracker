/**
 * Parse leading load×reps from strings like "100x10", "100×10 @ RPE8".
 * Returns undefined if the pattern does not match.
 */
export function parseLoadReps(
  text: string,
): { load: number; reps: number } | undefined {
  const t = text.replace(/×/g, "x").trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)/i);
  if (!m) return undefined;
  const load = parseFloat(m[1]);
  const reps = parseInt(m[2], 10);
  if (!Number.isFinite(load) || !Number.isFinite(reps)) return undefined;
  return { load, reps };
}
