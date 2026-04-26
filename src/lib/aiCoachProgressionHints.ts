import type { SuggestNextWorkoutAiExercise } from "@/types/aiCoach";

export type ParsedExerciseScheme = {
  weight: number;
  reps: number;
  sets: number | null;
};

/**
 * Parse compact set scheme strings like:
 * - "56×10 ×4"
 * - "20x8 x3"
 * - "127.5×9 ×2"
 *
 * Returns null if parsing fails.
 */
export function parseExerciseScheme(raw: string): ParsedExerciseScheme | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // weight x reps [x sets]
  // Allow both "x" and "×" separators, optional spaces, decimal weight.
  const m = s.match(
    /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*(?:[x×]\s*(\d+))?\s*$/i,
  );
  if (!m) return null;
  const w = Number(m[1]);
  const r = Number(m[2]);
  const sets = m[3] != null ? Number(m[3]) : null;
  if (!Number.isFinite(w) || !Number.isFinite(r)) return null;
  if (w <= 0 || r <= 0) return null;
  if (sets != null && (!Number.isFinite(sets) || sets <= 0)) return null;
  return { weight: w, reps: Math.round(r), sets: sets != null ? Math.round(sets) : null };
}

export function buildAutoProgressionHint(input: {
  ex: Pick<SuggestNextWorkoutAiExercise, "decision" | "decision_label">;
  scheme: ParsedExerciseScheme;
  locale: string;
}): string | null {
  const isRu = input.locale === "ru";
  const decision = String(input.ex.decision ?? "").toLowerCase();
  const raw = String(input.ex.decision_label ?? "").toLowerCase();
  const hay = `${decision} ${raw}`;

  const isIncreaseReps = hay.includes("+1 rep") || hay.includes("increase_reps");
  const isMaintainWeight = hay.includes("maintain weight");
  const isReduce = hay.includes("reduce");

  if (isIncreaseReps) {
    if (input.scheme.reps >= 12) {
      return isRu ? "Дальше: повысить вес" : "Next: increase weight";
    }
    const next = input.scheme.reps + 1;
    const w = Math.round(input.scheme.weight * 100) / 100;
    return isRu ? `Цель: ${w}×${next}` : `Target: ${w}×${next}`;
  }

  if (isMaintainWeight) {
    return isRu ? "Вес оставить" : "Keep weight stable";
  }

  if (isReduce) {
    return isRu ? "Снизить нагрузку сегодня" : "Reduce load today";
  }

  return null;
}

