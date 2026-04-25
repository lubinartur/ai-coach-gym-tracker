import type { WorkoutAiReview } from "@/types/aiCoach";

const CYR = /[а-яА-ЯёЁ]/;

/**
 * Heuristic: Russian UI expects Cyrillic in coach copy. English exercise names
 * in `exercise_notes.name` are checked separately; we do not test `name` here.
 */
function segmentLooksLikeLatinOnlyCoachCopy(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (CYR.test(t)) return false;
  const letters = t.match(/[A-Za-z]/g) || [];
  const longWords = t.match(/\b[A-Za-z]{3,}\b/g) || [];
  if (letters.length >= 14) return true;
  if (longWords.length >= 2) return true;
  if (longWords.length === 1 && letters.length >= 7) return true;
  return false;
}

/**
 * true → response should be retried in Russian.
 */
export function shouldRetryRussianWorkoutReview(review: WorkoutAiReview): boolean {
  const textParts: string[] = [
    review.verdict ?? "",
    review.summary,
    ...review.went_well,
    ...review.needs_attention,
    ...review.next_time,
  ];
  for (const p of textParts) {
    if (segmentLooksLikeLatinOnlyCoachCopy(p)) return true;
  }
  for (const n of review.exercise_notes) {
    if (n.note && segmentLooksLikeLatinOnlyCoachCopy(n.note)) return true;
  }
  return false;
}
