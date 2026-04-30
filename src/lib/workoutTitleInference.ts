import { normalizeExerciseName } from "@/lib/exerciseName";
import type { WorkoutReviewRequestPayload } from "@/types/aiCoach";
import type { Exercise, WorkoutExercise, WorkoutSession } from "@/types/trainingDiary";

type Goal = NonNullable<WorkoutReviewRequestPayload["workoutGoal"]>;

export type InferredWorkoutTitle = {
  /** Title to display/use if override is appropriate. */
  inferredTitle: string;
  /** True when the input title looked auto-generated and was overridden. */
  overridden: boolean;
  /** Short reason for debugging (not user-facing). */
  reason: string;
};

const AUTO_TITLE_RE = /^(Push|Pull|Legs|Upper|Full Body)(\s+(Workout|Session|Hypertrophy Session|Strength Session))?(\s+\(split guard\))?$/i;
const AUTO_TITLE_PREFIX_RE = /^(Coach\s+)/i;
const AUTO_TITLE_EXACT = new Set<string>([
  "Full body (default)",
  "Full body (split guard)",
]);

function isLikelyAutoTitle(title: string): boolean {
  const t = (title ?? "").trim();
  if (!t) return true;
  if (AUTO_TITLE_EXACT.has(t)) return true;
  if (AUTO_TITLE_PREFIX_RE.test(t)) return true;
  if (AUTO_TITLE_RE.test(t)) return true;
  return false;
}

function goalSuffix(goal: Goal): { suffix: string; kind: "session" | "workout" } {
  switch (goal) {
    case "hypertrophy":
      return { suffix: "Hypertrophy Session", kind: "session" };
    case "strength":
      return { suffix: "Strength Session", kind: "session" };
    case "fat_loss":
    case "general_fitness":
    default:
      return { suffix: "Workout", kind: "workout" };
  }
}

type MajorBucket = "chest" | "back" | "legs" | "shoulders" | "arms" | "core" | "calves" | "other";

function bucketFromPrimary(m: string): MajorBucket {
  const k = String(m ?? "").trim().toLowerCase();
  if (k === "chest") return "chest";
  if (k === "back") return "back";
  if (k === "shoulders") return "shoulders";
  if (k === "biceps" || k === "triceps" || k === "forearms") return "arms";
  if (k === "core") return "core";
  if (k === "calves") return "calves";
  if (k === "legs" || k === "hamstrings") return "legs";
  if (k === "glutes") return "legs";
  return "other";
}

function computeSetDistribution(input: {
  exercises: Array<Pick<WorkoutExercise, "name" | "exerciseId" | "sets">>;
  catalog: Exercise[];
}): { byBucket: Map<MajorBucket, number>; totalSets: number } {
  const byId = new Map<string, Exercise>();
  const byNorm = new Map<string, Exercise>();
  for (const ex of input.catalog) {
    if (ex.id) byId.set(ex.id, ex);
    const k = ex.normalizedName?.trim() || normalizeExerciseName(ex.name);
    if (k && !byNorm.has(k)) byNorm.set(k, ex);
  }

  const byBucket = new Map<MajorBucket, number>();
  let total = 0;

  for (const ex of input.exercises) {
    const doneSets = (ex.sets ?? []).filter((st) => (st as { isDone?: boolean }).isDone !== false).length;
    if (doneSets <= 0) continue;
    total += doneSets;

    const row =
      (ex.exerciseId && byId.get(ex.exerciseId)) ||
      byNorm.get(normalizeExerciseName(ex.name) ?? "") ||
      null;
    const primary = row?.primaryMuscle ?? row?.muscleGroup ?? "other";
    const b = bucketFromPrimary(primary);
    byBucket.set(b, (byBucket.get(b) ?? 0) + doneSets);
  }

  return { byBucket, totalSets: total };
}

function inferSplitLabel(dist: { byBucket: Map<MajorBucket, number>; totalSets: number }): {
  label: "Full Body" | "Upper Body" | "Push" | "Pull" | "Legs" | "Custom";
  reason: string;
} {
  const total = dist.totalSets;
  if (total <= 0) return { label: "Custom", reason: "no_sets" };

  const majorBuckets: MajorBucket[] = ["chest", "back", "legs", "shoulders", "arms"];
  const represented = majorBuckets.filter((b) => (dist.byBucket.get(b) ?? 0) >= 2).length;
  if (represented >= 4) return { label: "Full Body", reason: "4+ major buckets" };

  const legs = dist.byBucket.get("legs") ?? 0;
  const chest = dist.byBucket.get("chest") ?? 0;
  const back = dist.byBucket.get("back") ?? 0;
  const shoulders = dist.byBucket.get("shoulders") ?? 0;
  const arms = dist.byBucket.get("arms") ?? 0;

  const push = chest + shoulders + arms; // arms includes triceps; coarse but acceptable for split naming
  const pull = back + arms; // arms includes biceps; coarse but acceptable
  const upper = chest + back + shoulders + arms;

  const top = [...dist.byBucket.entries()].sort((a, b) => b[1] - a[1])[0];
  const topBucket = top?.[0] ?? "other";
  const topShare = top ? top[1] / total : 0;

  if (topShare > 0.7) {
    if (topBucket === "legs") return { label: "Legs", reason: ">70% legs" };
    if (topBucket === "back" || pull / total > 0.75) return { label: "Pull", reason: ">70% pull/back" };
    if (topBucket === "chest" || topBucket === "shoulders" || push / total > 0.75) {
      return { label: "Push", reason: ">70% push/chest/shoulders" };
    }
    if (topBucket === "arms") return { label: "Pull", reason: ">70% arms (treated as pull-ish)" };
  }

  if (upper / total >= 0.7 && legs / total <= 0.3) {
    return { label: "Upper Body", reason: "upper dominates" };
  }
  if (push / total >= 0.65 && legs / total <= 0.35) {
    return { label: "Push", reason: "push dominates" };
  }
  if (pull / total >= 0.65 && legs / total <= 0.35) {
    return { label: "Pull", reason: "pull dominates" };
  }
  if (represented >= 3) return { label: "Full Body", reason: "3 major buckets" };

  return { label: "Custom", reason: "mixed" };
}

export function inferWorkoutTitleFromExercises(input: {
  /** Existing saved title (may be auto-generated). */
  currentTitle: string;
  /** Completed workout exercises (with sets). */
  exercises: WorkoutSession["exercises"];
  /** Canonical exercise catalog for primary muscle mapping. */
  catalog: Exercise[];
  workoutGoal?: WorkoutReviewRequestPayload["workoutGoal"];
}): InferredWorkoutTitle {
  const currentTitle = (input.currentTitle ?? "").trim();
  const goal: Goal = (input.workoutGoal ?? "general_fitness") as Goal;
  const { suffix } = goalSuffix(goal);

  const dist = computeSetDistribution({ exercises: input.exercises, catalog: input.catalog });
  const split = inferSplitLabel(dist);
  const inferredTitle =
    split.label === "Custom" ? (currentTitle || `Custom ${suffix}`) : `${split.label} ${suffix}`;

  const auto = isLikelyAutoTitle(currentTitle);
  const normalizedCurrent = currentTitle.toLowerCase();
  const normalizedInferred = inferredTitle.toLowerCase();

  if (!auto) {
    return { inferredTitle: currentTitle || inferredTitle, overridden: false, reason: "manual_title" };
  }
  if (!currentTitle) {
    return { inferredTitle, overridden: true, reason: "empty_title" };
  }
  if (normalizedCurrent === normalizedInferred) {
    return { inferredTitle: currentTitle, overridden: false, reason: "match" };
  }

  // Only override if the inferred split is materially different than the current title.
  // Example: "Legs Hypertrophy Session" vs "Full Body Hypertrophy Session".
  const currentLooksLegs = /\blegs\b/i.test(currentTitle);
  const inferredFull = split.label === "Full Body";
  const inferredLegs = split.label === "Legs";
  if (currentLooksLegs && inferredFull) {
    return { inferredTitle, overridden: true, reason: `mismatch:${split.reason}` };
  }
  if (!inferredLegs && /\bpush\b|\bpull\b|\bupper\b|\bfull body\b/i.test(inferredTitle)) {
    return { inferredTitle, overridden: true, reason: `mismatch:${split.reason}` };
  }

  // Conservative default: keep current if we can't confidently call it.
  return { inferredTitle: currentTitle, overridden: false, reason: `keep:${split.reason}` };
}

