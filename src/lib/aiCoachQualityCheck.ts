import { normalizeSplitLabel, type MuscleBucket } from "@/lib/aiCoach/splitLabels";
import type { AiDecisionContext, SuggestNextWorkoutResponse } from "@/types/aiCoach";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { Exercise } from "@/types/trainingDiary";
import {
  buildCatalogLookup,
  resolveCatalogRowByExerciseName,
} from "@/services/exerciseCatalogResolve";

type Result = { passed: boolean; warnings: string[] };

function primaryMuscleToProgressBucket(
  m: PrimaryMuscleGroup,
): MuscleBucket | "other" {
  switch (m) {
    case "chest":
      return "chest";
    case "back":
      return "back";
    case "shoulders":
      return "shoulders";
    case "legs":
    case "hamstrings":
      return "legs";
    case "biceps":
    case "triceps":
    case "forearms":
      return "arms";
    case "calves":
      return "calves";
    default:
      return "other";
  }
}

function isProbablyRu(result: SuggestNextWorkoutResponse): boolean {
  const hay = `${result.title}\n${result.reason}\n${result.exercises
    .map((e) => e.decision_label)
    .join(" ")}\n${result.insights.map((i) => i.title + " " + i.text).join(" ")}`;
  return /[А-Яа-яЁё]/.test(hay);
}

function insightMentionsIncrease(ins: {
  title: string;
  text: string;
}): { muscle: MuscleBucket | null } {
  const t = `${ins.title} ${ins.text}`.toLowerCase();
  const inc =
    /increase|increasing|add(ing)?|больше|увелич|добавля/.test(t) &&
    /объ|volume|load|нагруз/.test(t);
  if (!inc) return { muscle: null };
  if (/back|спин/.test(t)) return { muscle: "back" };
  if (/leg|ног/.test(t)) return { muscle: "legs" };
  if (/chest|груд/.test(t)) return { muscle: "chest" };
  if (/shoulder|плеч/.test(t)) return { muscle: "shoulders" };
  if (/arm|рук|бицеп|трицеп/.test(t)) return { muscle: "arms" };
  if (/calf|икр/.test(t)) return { muscle: "calves" };
  return { muscle: null };
}

function isMixedLanguageLabel(label: string): boolean {
  const s = (label ?? "").toLowerCase();
  return (
    s.includes("and reps") ||
    s.includes("and sets") ||
    /\bmaintain\b/.test(s) ||
    /\bincrease\b/.test(s) ||
    /\breduce\b/.test(s)
  );
}

export function validateAiCoachSuggestion(
  result: SuggestNextWorkoutResponse,
  aiDecisionContext: AiDecisionContext | null,
  exerciseCatalog?: Exercise[] | null,
): Result {
  const warnings: string[] = [];

  // 1) Split consistency
  const rec = aiDecisionContext?.splitSelection?.recommendedSplit;
  if (rec) {
    const recNorm = normalizeSplitLabel(rec);
    const sugNorm = normalizeSplitLabel(result.training_signals?.split ?? result.title);
    if (recNorm !== "unknown" && sugNorm !== "unknown" && recNorm !== sugNorm) {
      warnings.push("Suggested split differs from splitSelection recommendation");
    }
  }

  // 2) Insight consistency
  const progressedByMuscle = new Map<string, number>();
  const catalog = exerciseCatalog?.length ? buildCatalogLookup(exerciseCatalog) : null;
  for (const ex of result.exercises) {
    if (ex.decision === "maintain") continue;
    if (!catalog) continue;
    const row = resolveCatalogRowByExerciseName(ex.name, catalog);
    const b = row ? primaryMuscleToProgressBucket(row.primaryMuscle) : "other";
    if (b === "other") continue;
    progressedByMuscle.set(b, (progressedByMuscle.get(b) ?? 0) + 1);
  }
  for (const ins of result.insights) {
    const m = insightMentionsIncrease(ins);
    if (!m.muscle) continue;
    if ((progressedByMuscle.get(m.muscle) ?? 0) === 0) {
      warnings.push(
        "Insight mentions volume increase but no matching exercise progression found",
      );
      break;
    }
  }

  // 3) Passive workout check
  const baselineLike =
    (aiDecisionContext?.recentWorkouts?.length ?? 0) < 2 ||
    result.training_signals?.fatigue === "unknown" ||
    result.training_signals?.volume_trend === "unknown";
  if (!baselineLike && result.exercises.length > 0) {
    const maintainCount = result.exercises.filter((e) => e.decision === "maintain").length;
    if (maintainCount / result.exercises.length > 0.7) {
      warnings.push("Workout is too passive: most exercises are maintain");
    }
  }

  // 4) Fatigue safety
  const fat = result.training_signals?.fatigue;
  if (fat === "high") {
    const aggressive = result.exercises.some(
      (e) =>
        (e.decision === "increase" || e.decision === "volume") &&
        /set|\+|kg|weight|load/i.test(e.decision_label ?? ""),
    );
    if (aggressive) {
      warnings.push("Progression may be too aggressive for high fatigue");
    }
  }

  // 5) Language consistency
  const ru = isProbablyRu(result);
  if (ru) {
    const mixed = result.exercises.some((e) => isMixedLanguageLabel(e.decision_label));
    if (mixed) warnings.push("Mixed language label detected");
  }

  return { passed: warnings.length === 0, warnings };
}

