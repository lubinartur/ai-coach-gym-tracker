import type { Exercise, WorkoutSession } from "@/types/trainingDiary";
import { normalizeExerciseName } from "@/services/exerciseStats";
import { QUICK_WORKOUT_TEMPLATES } from "@/lib/workoutQuickTemplates";

/** "Today" | "Yesterday" | "N days ago" | "Weeks ago" from session date (YYYY-MM-DD). */
export function formatWorkoutLastPerformed(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return "";
  }
  const sessionDay = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const s = new Date(
    sessionDay.getFullYear(),
    sessionDay.getMonth(),
    sessionDay.getDate(),
  );
  const diffDays = Math.round(
    (today.getTime() - s.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  }
  return sessionDay.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Resolves a display line like "Chest • Shoulders" from session exercises + catalog, with fallbacks. */
export function muscleLineForSession(
  session: WorkoutSession,
  catalog: Exercise[],
): string {
  const byKey = new Map<string, Exercise>();
  for (const e of catalog) {
    byKey.set(normalizeExerciseName(e.name), e);
  }
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const w of session.exercises) {
    const match = byKey.get(normalizeExerciseName(w.name));
    const mg = match?.muscleGroup?.trim();
    if (mg) {
      const k = mg.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        labels.push(mg);
      }
    }
  }
  if (labels.length > 0) return labels.join(" • ");
  const tTitle = session.title.trim().toLowerCase();
  const byTitle = QUICK_WORKOUT_TEMPLATES.find(
    (t) =>
      t.label.toLowerCase() === tTitle ||
      tTitle.startsWith(t.label.toLowerCase()) ||
      tTitle.startsWith(t.id),
  );
  if (byTitle) return byTitle.muscleLine;
  if (session.exercises.length > 0) {
    return session.exercises
      .slice(0, 3)
      .map((e) => e.name)
      .join(" • ");
  }
  return "—";
}
