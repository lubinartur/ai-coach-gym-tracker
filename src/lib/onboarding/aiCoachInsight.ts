import type { AthleteExperience, AthleteTrainingGoal } from "@/types/athleteProfile";

type Input = {
  goal: AthleteTrainingGoal | null;
  trainingLevel: AthleteExperience | null;
  trainingFrequencyDays: number | null; // 2..5 (5 = 5+)
};

function normalizeDays(d: number | null): 2 | 3 | 4 | 5 | null {
  if (d == null || !Number.isFinite(d)) return null;
  if (d <= 2) return 2;
  if (d === 3) return 3;
  if (d === 4) return 4;
  return 5;
}

function sentence(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ").trim();
}

export function buildAiCoachInsight({
  goal,
  trainingLevel,
  trainingFrequencyDays,
}: Input): string {
  const days = normalizeDays(trainingFrequencyDays);

  const levelLine =
    trainingLevel === "beginner"
      ? "We’ll focus on simple exercises and steady progress."
      : trainingLevel === "intermediate"
        ? "You already have a training base — we’ll focus on progressive overload."
        : trainingLevel === "advanced"
          ? "We can apply higher weekly volume and more advanced splits."
          : null;

  const freqLine =
    days === 2
      ? "We’ll use efficient full-body sessions."
      : days === 3
        ? "This allows balanced full-body strength development."
        : days === 4
          ? "We can use an upper/lower split for optimal recovery."
          : days === 5
            ? "A push/pull/legs structure will maximize training stimulus."
            : null;

  const goalLine =
    goal === "build_muscle"
      ? "We’ll use moderate weights and controlled volume."
      : goal === "strength"
        ? "We’ll prioritize compound lifts and progressive overload."
        : goal === "lose_fat"
          ? "We’ll combine strength training with efficient workout density."
          : goal === "general_fitness"
            ? "We’ll focus on balanced strength and overall conditioning."
            : goal === "recomposition"
              ? "We’ll blend muscle-building work with sustainable fat loss progress."
              : null;

  // Preferred combined phrasing when we have all three signals.
  if (trainingLevel && days && goal) {
    // Split / structure line (tailored combos).
    const splitLine =
      trainingLevel === "beginner"
        ? days === 2 || days === 3
          ? "We’ll start with full-body workouts using simple compound movements."
          : "We’ll start with a simple split built around compound movements."
        : trainingLevel === "intermediate"
          ? days === 4
            ? "A 4-day schedule lets us run an upper/lower split for strong recovery."
            : days === 5
              ? "We can distribute volume across the week with a structured split."
              : "We’ll build a structured plan with balanced volume and recovery."
          : days === 5
            ? "With 5+ days, we can run a push/pull/legs split to manage weekly volume."
            : "We’ll use a structured split and tighter progression to keep you improving.";

    const goalModifier =
      goal === "build_muscle"
        ? "Expect hypertrophy-focused training with progressive overload."
        : goal === "strength"
          ? "We’ll center the plan around heavy compound lifts and clear progression."
          : goal === "lose_fat"
            ? "We’ll keep sessions efficient while maintaining strength."
            : goal === "general_fitness"
              ? "We’ll balance strength work with conditioning."
              : "We’ll balance strength and physique progress steadily.";

    return sentence([splitLine, goalModifier]);
  }

  // Otherwise, return the most informative 1–2 lines we can.
  return sentence([levelLine, freqLine, goalLine]) || "Answer a few questions and I’ll tailor your plan.";
}

