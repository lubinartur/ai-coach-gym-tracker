/**
 * Infers training "split" labels from workout titles and exercise names.
 * Score-based keyword matching; used by the AI pipeline and server post-validation.
 */

export type WorkoutSplitLabel = "Push" | "Pull" | "Legs" | "Full" | "Unknown";

const FULL_PATTERNS = /\bfull[-\s]?body|\bfull\s*day|вс[её]?\s*тел|фулл(\s*боди)?/i;

const PULL_KEYWORDS = [
  "pull",
  "row",
  "rows",
  "barbell row",
  "dumbbell row",
  "cable row",
  "lat",
  "lat pulldown",
  "pulldown",
  "pullup",
  "pull-up",
  "chinup",
  "chin-up",
  "chin up",
  "rear delt",
  "face pull",
  "biceps",
  "bicep",
  "curl",
  "hammer curl",
  "ez curl",
  "spina",
  "спина",
  "тяга",
  "бицепс",
  "подтяг",
] as const;

const PUSH_KEYWORDS = [
  "push",
  "bench",
  "bench press",
  "incline",
  "chest",
  "shoulder press",
  "overhead press",
  "triceps",
  "tricep",
  "dip",
  "dips",
  "жим",
  "грудь",
  "трицепс",
  "плечи",
] as const;

const LEGS_KEYWORDS = [
  "leg",
  "legs",
  "squat",
  "back squat",
  "front squat",
  "hack squat",
  "lunge",
  "leg press",
  "hamstring",
  "hamstrings",
  "quad",
  "calf",
  "calves",
  "ноги",
  "присед",
  "квадрицепс",
  "бицепс бедра",
  "икры",
] as const;

function textIncludesKeyword(
  text: string,
  kw: string,
  which: "push" | "pull" | "legs",
): boolean {
  if (which === "legs") {
    if (kw === "leg") {
      return /\b(leg\s*day|leg)\b/i.test(text);
    }
    if (kw === "legs") {
      return /\blegs\b/i.test(text);
    }
  }
  if (which === "pull" && kw === "бицепс" && text.includes("бицепс бедра")) {
    return false;
  }
  return text.includes(kw);
}

function scoreKeywords(
  text: string,
  keywords: readonly string[],
  which: "push" | "pull" | "legs",
): number {
  let n = 0;
  for (const kw of keywords) {
    if (textIncludesKeyword(text, kw, which)) n += 1;
  }
  return n;
}

function exerciseCurlBoost(exercises: { name: string }[] | undefined): number {
  if (!exercises?.length) return 0;
  let add = 0;
  for (const ex of exercises) {
    const n = (ex.name ?? "").toLowerCase();
    if (n.includes("curl")) add += 2;
  }
  return add;
}

function inferSplitFromScores(score: {
  push: number;
  pull: number;
  legs: number;
}): "Push" | "Pull" | "Legs" | "Unknown" {
  const maxScore = Math.max(score.push, score.pull, score.legs);
  if (maxScore === 0) return "Unknown";
  if (score.pull === maxScore) return "Pull";
  if (score.push === maxScore) return "Push";
  if (score.legs === maxScore) return "Legs";
  return "Unknown";
}

/**
 * Classify a workout from its title and exercise name list.
 */
export function inferWorkoutSplitFromTitleAndExercises(s: {
  title: string;
  exercises?: { name: string }[];
}): WorkoutSplitLabel {
  const title = s.title ?? "";
  const exercises = s.exercises;
  const nameLines =
    exercises?.map((e) => (e.name ?? "").toLowerCase()).filter(Boolean) ?? [];
  const combined = [title.toLowerCase(), ...nameLines].join("\n");

  if (FULL_PATTERNS.test(combined)) return "Full";

  const score = { push: 0, pull: 0, legs: 0 };

  score.push += scoreKeywords(combined, PUSH_KEYWORDS, "push");
  score.pull += scoreKeywords(combined, PULL_KEYWORDS, "pull");
  score.legs += scoreKeywords(combined, LEGS_KEYWORDS, "legs");
  score.pull += exerciseCurlBoost(exercises);

  const inner = inferSplitFromScores(score);

  if (process.env.NODE_ENV !== "production") {
    console.log("[splitInference]", {
      title,
      exercises: exercises?.map((e) => e.name) ?? [],
      score: { ...score },
    });
  }

  return inner;
}

export function preferredNextSplits(
  last: WorkoutSplitLabel,
): ("Push" | "Pull" | "Legs" | "Full")[] {
  if (last === "Pull") return ["Push", "Legs"];
  if (last === "Push") return ["Pull", "Legs"];
  if (last === "Legs") return ["Push", "Pull"];
  if (last === "Full") return ["Push", "Pull", "Legs"];
  return ["Push", "Pull", "Legs", "Full"];
}

export function splitRepetitionViolatesGuard(
  guard: { guardActive: boolean; lastWorkoutSplit: WorkoutSplitLabel },
  suggested: WorkoutSplitLabel,
): boolean {
  if (!guard.guardActive) return false;
  if (guard.lastWorkoutSplit === "Unknown" || suggested === "Unknown")
    return false;
  return suggested === guard.lastWorkoutSplit;
}
