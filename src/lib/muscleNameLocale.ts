import type { WorkoutAiReview } from "@/types/aiCoach";

type MuscleMap = Record<string, string>;

// NOTE: We intentionally match lowercase Latin tokens only.
// This avoids translating exercise names like "Back Squat" or "Chest Press",
// while still fixing mixed-language coach copy such as "quads и chest".
const RU_MUSCLE_TOKENS: MuscleMap = {
  quads: "квадрицепсы",
  chest: "грудь",
  back: "спина",
  biceps: "бицепс",
  triceps: "трицепс",
  shoulders: "плечи",
  glutes: "ягодицы",
  hamstrings: "бицепс бедра",
  calves: "икры",
};

function replaceLowercaseMuscleTokensRu(text: string): string {
  let out = String(text ?? "");
  // Replace tokens when bounded by non-Latin letters (or edges).
  // We keep the left delimiter in a capture group.
  for (const [token, ru] of Object.entries(RU_MUSCLE_TOKENS)) {
    const re = new RegExp(`(^|[^A-Za-z])${token}(?=[^A-Za-z]|$)`, "g");
    out = out.replace(re, `$1${ru}`);
  }
  return out;
}

export function localizeWorkoutReviewRu(review: WorkoutAiReview): WorkoutAiReview {
  return {
    ...review,
    verdict: replaceLowercaseMuscleTokensRu(review.verdict ?? ""),
    summary: replaceLowercaseMuscleTokensRu(review.summary),
    went_well: review.went_well.map(replaceLowercaseMuscleTokensRu),
    needs_attention: review.needs_attention.map(replaceLowercaseMuscleTokensRu),
    next_time: review.next_time.map(replaceLowercaseMuscleTokensRu),
    // Exercise names must remain as-is; only localize note text.
    exercise_notes: review.exercise_notes.map((n) => ({
      name: n.name,
      note: replaceLowercaseMuscleTokensRu(n.note),
    })),
  };
}

