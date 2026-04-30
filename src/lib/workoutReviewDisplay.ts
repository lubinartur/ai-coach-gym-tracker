import { normalizeExerciseName } from "@/lib/exerciseName";
import type {
  AiInsightType,
  WorkoutAiReview,
  WorkoutReviewGrade,
} from "@/types/aiCoach";

const NOTE_MAX = 200;
const BULLET_MAX = 150;
const VERDICT_MAX = 280;

const GRADES: WorkoutReviewGrade[] = [
  "A+",
  "A",
  "B+",
  "B",
  "C",
  "D",
];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * If the model returns an odd token, infer from score or default to "B".
 */
export function normalizeWorkoutReviewGrade(
  raw: string | undefined,
  score: number,
): WorkoutReviewGrade {
  const t = raw?.trim() ?? "";
  if (GRADES.includes(t as WorkoutReviewGrade)) return t as WorkoutReviewGrade;
  if (t === "A-" || t === "B-") {
    if (t === "A-") return "A";
    return "B";
  }
  if (score >= 93) return "A+";
  if (score >= 87) return "A";
  if (score >= 80) return "B+";
  if (score >= 72) return "B";
  if (score >= 60) return "C";
  return "D";
}

/**
 * Heuristic match for "key" main lifts: bench, squat, deadlift, overhead/shoulder press.
 */
export function isKeyLiftExerciseName(name: string): boolean {
  const n = normalizeExerciseName(name);
  if (n.includes("leg press") || n.includes("calf")) return false;
  if (n.includes("deadlift")) return true;
  if (n.includes("bench") && n.includes("press")) return true;
  if (n.includes("squat") && !n.includes("sissy") && !n.includes("split squat"))
    return true;
  if (n.includes("overhead") && n.includes("press")) return true;
  if (n.includes("military") && n.includes("press")) return true;
  if (/(^|\s)ohp(\s|$)/.test(n)) return true;
  if (n.includes("shoulder press") && !n.includes("lateral")) return true;
  return false;
}

function oneSentence(s: string, maxLen: number): string {
  const t = s.trim();
  if (!t) return t;
  const m = t.match(/^[^.!?]+[.!?]?/);
  const one = (m ? m[0]! : t).trim();
  if (one.length <= maxLen) return one;
  return `${one.slice(0, maxLen - 1).trimEnd()}…`;
}

function firstSentences(s: string, count: number, maxLen: number): string {
  const t = s.trim();
  if (!t) return t;
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const joined = parts.slice(0, count).join(" ");
  if (joined.length <= maxLen) return joined;
  if (maxLen < 2) return "…";
  return `${joined.slice(0, maxLen - 1).trimEnd()}…`;
}

/** Clamp a note to ~1–2 short lines for UI. */
export function clampNoteForDisplay(note: string, maxLen: number = NOTE_MAX): string {
  const t = note.trim();
  if (t.length <= maxLen) return t;
  return firstSentences(t, 2, maxLen);
}

/**
 * Enforce length limits, single-sentence bullets, and key-lift-only notes.
 * Call server-side on parse; optional client pass for older stored reviews.
 */
export function enforceWorkoutReviewLimits(
  review: WorkoutAiReview,
): WorkoutAiReview {
  const scoreClamped =
    typeof review.score === "number" && Number.isFinite(review.score)
      ? clamp01(review.score)
      : undefined;
  const gradeNorm =
    scoreClamped !== undefined
      ? normalizeWorkoutReviewGrade(review.grade, scoreClamped)
      : review.grade
        ? normalizeWorkoutReviewGrade(review.grade, 70)
        : undefined;

  const exercise_notes = review.exercise_notes
    .filter((n) => isKeyLiftExerciseName(n.name))
    .map((n) => ({
      name: n.name,
      note: clampNoteForDisplay(n.note, NOTE_MAX),
    }));

  const insightTypes: AiInsightType[] = [
    "progress",
    "fatigue",
    "balance",
    "risk",
    "opportunity",
  ];
  const insights =
    Array.isArray(review.insights) && review.insights.length
      ? review.insights
          .filter(
            (i) => i && typeof i.title === "string" && typeof i.text === "string",
          )
          .slice(0, 5)
          .map((i) => {
            const it = i.type;
            const type: AiInsightType =
              it && insightTypes.includes(it) ? it : "progress";
            return {
              type,
              title: (i.title ?? "").trim() || "—",
              text: (i.text ?? "").trim() || "—",
            };
          })
      : undefined;

  const warnings =
    Array.isArray(review.warnings) && review.warnings.length
      ? review.warnings
          .filter((s) => typeof s === "string" && s.trim().length > 0)
          .slice(0, 5)
          .map((s) => oneSentence(s, BULLET_MAX))
      : undefined;

  return {
    ...(scoreClamped !== undefined ? { score: scoreClamped } : {}),
    ...(gradeNorm ? { grade: gradeNorm } : {}),
    ...(review.verdict?.trim()
      ? { verdict: firstSentences(review.verdict, 2, VERDICT_MAX).trim() }
      : {}),
    summary: firstSentences(review.summary, 3, 480).trim(),
    went_well: review.went_well
      .slice(0, 3)
      .map((s) => oneSentence(s, BULLET_MAX)),
    needs_attention: review.needs_attention
      .slice(0, 2)
      .map((s) => oneSentence(s, BULLET_MAX)),
    next_time: review.next_time
      .slice(0, 3)
      .map((s) => oneSentence(s, BULLET_MAX)),
    exercise_notes,
    ...(insights?.length ? { insights } : {}),
    ...(warnings?.length ? { warnings } : {}),
  };
}
