import type { WorkoutSession } from "@/types/trainingDiary";

/**
 * Milliseconds since epoch for ordering / recency. Prefer `performedAt` (when the
 * work happened) over `createdAt` (when the entry was saved), then `date` (calendar).
 */
export function getWorkoutChronologyTime(session: WorkoutSession): number {
  if (session.performedAt) {
    const t = Date.parse(session.performedAt);
    if (Number.isFinite(t)) return t;
  }
  if (session.createdAt) {
    const t = Date.parse(session.createdAt);
    if (Number.isFinite(t)) return t;
  }
  if (session.date) {
    const t = Date.parse(session.date + "T12:00:00");
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/** For history: `2026-04-25 18:41` in local time, using `performedAt` if set else `createdAt`. */
export function formatWorkoutHistoryDateTime(s: WorkoutSession): string {
  const source = s.performedAt || s.createdAt;
  if (typeof source === "string" && source) {
    const d = new Date(source);
    if (Number.isFinite(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${day} ${hh}:${mm}`;
    }
  }
  if (s.date) {
    return `${s.date} 00:00`;
  }
  return "—";
}

export function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

export function datetimeLocalValueToIso(local: string): string {
  const d = new Date(local);
  if (!Number.isFinite(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export function localDateStringFromDatetimeLocal(local: string): string {
  const d = new Date(local);
  if (!Number.isFinite(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
