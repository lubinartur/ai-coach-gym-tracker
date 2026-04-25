import type {
  ProgressionPlan,
  ProgressionPlanExercise,
  TrainingSignalEngineOutput,
} from "@/types/aiCoach";

function cap(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

function actionForTrend(input: {
  trend: TrainingSignalEngineOutput["exerciseTrends"][number]["trend"];
  fatigueLevel: TrainingSignalEngineOutput["fatigueTrend"]["level"];
  focus: TrainingSignalEngineOutput["progressionFocus"];
  note: string;
}): { action: ProgressionPlanExercise["action"]; reason: string } {
  const { trend, fatigueLevel, focus, note } = input;

  if (focus === "deload" || fatigueLevel === "high") {
    return { action: "reduce_sets", reason: "Fatigue/deload: reduce working sets; keep technique clean." };
  }
  if (trend === "improving") {
    return { action: "increase_reps", reason: "Improving: progress reps first (single variable)." };
  }
  if (trend === "stable") {
    return { action: "increase_reps", reason: "Stable: increase reps before weight." };
  }
  if (trend === "stagnating" && fatigueLevel === "low") {
    if (/stimulus has been low/i.test(note)) {
      return { action: "swap_exercise", reason: "Stagnating with low stimulus: try a close variation." };
    }
    return { action: "increase_sets", reason: "Stagnating with low fatigue: +1 working set or variation." };
  }
  if (trend === "declining") {
    if (fatigueLevel === "moderate") {
      return { action: "maintain", reason: "Declining with moderate fatigue: consolidate and avoid pushing load." };
    }
    return { action: "reduce_weight", reason: "Declining: reduce load slightly and rebuild reps/quality." };
  }
  return { action: "maintain", reason: "Not enough signal: maintain and consolidate." };
}

export function buildProgressionPlan(
  trainingSignals: TrainingSignalEngineOutput,
): ProgressionPlan {
  const fatigue = trainingSignals.fatigueTrend.level;
  const focus = trainingSignals.progressionFocus;

  let globalStrategy: ProgressionPlan["globalStrategy"] = "maintain";
  if (focus === "deload") globalStrategy = "deload";
  else if (fatigue === "high") globalStrategy = "deload";
  else if (fatigue === "moderate") globalStrategy = "maintain";
  else if (fatigue === "low") globalStrategy = "progress";
  else globalStrategy = "maintain";

  const exercisePlans: ProgressionPlanExercise[] = trainingSignals.exerciseTrends
    .slice(0, 12)
    .map((t) => {
      const { action, reason } = actionForTrend({
        trend: t.trend,
        fatigueLevel: fatigue,
        focus,
        note: t.note,
      });
      return {
        exerciseName: t.exerciseName,
        action,
        reason: cap(reason, 120),
        target: undefined,
      };
    });

  // If many muscles are fatigued, bias toward reduce.
  const fatiguedMuscles = trainingSignals.muscleRecovery.filter((m) => m.status === "fatigued").length;
  if (globalStrategy === "progress" && fatiguedMuscles >= 3) globalStrategy = "maintain";
  if (globalStrategy !== "deload" && fatigue === "high") globalStrategy = "deload";

  return { globalStrategy, exercisePlans };
}

