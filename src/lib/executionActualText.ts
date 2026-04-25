/** Gym-friendly text tweaks for actualValue (best-effort, no full parser). */

export function copyPlanned(planned: string): string {
  return planned.trim();
}

export function bumpRepsInLoadRepsString(text: string, delta: number): string {
  const raw = text.trim();
  if (!raw) return raw;
  const normalized = raw.replace(/×/g, "x");
  const m = normalized.match(/^(\d+(?:\.\d+)?)(\s*x\s*)(\d+)/i);
  if (!m) return raw;
  const reps = Math.max(1, parseInt(m[3], 10) + delta);
  return `${m[1]}×${reps}`;
}

export function bumpLoadInLoadRepsString(text: string, deltaKg: number): string {
  const raw = text.trim();
  if (!raw) return raw;
  const normalized = raw.replace(/×/g, "x");
  const m = normalized.match(/^(\d+(?:\.\d+)?)(\s*x\s*)(\d+)/i);
  if (!m) return raw;
  const load = Math.max(0, parseFloat(m[1]) + deltaKg);
  const rounded = Math.round(load * 2) / 2;
  const wStr = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(/\.0$/, "");
  return `${wStr}×${m[3]}`;
}
