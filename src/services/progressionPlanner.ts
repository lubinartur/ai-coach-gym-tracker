import { cap } from "@/lib/string/cap";
import type {
  AiDecisionContext,
  CoachingContextSignals,
  ProgressionPlan,
  ProgressionPlanExercise,
} from "@/types/aiCoach";
import { evaluateRecoveryState } from "@/services/recoveryEngine";

function actionForTrend(input: {
  trend: CoachingContextSignals["exerciseTrends"][number]["trend"];
  fatigueLevel: CoachingContextSignals["fatigueTrend"]["level"];
  focus: CoachingContextSignals["progressionFocus"];
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
  coachingContextSignals: CoachingContextSignals,
): ProgressionPlan {
  const fatigue = coachingContextSignals.fatigueTrend.level;
  const focus = coachingContextSignals.progressionFocus;

  let globalStrategy: ProgressionPlan["globalStrategy"] = "maintain";
  if (focus === "deload") globalStrategy = "deload";
  else if (fatigue === "high") globalStrategy = "deload";
  else if (fatigue === "moderate") globalStrategy = "maintain";
  else if (fatigue === "low") globalStrategy = "progress";
  else globalStrategy = "maintain";

  const exercisePlans: ProgressionPlanExercise[] = coachingContextSignals.exerciseTrends
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
  const fatiguedMuscles = coachingContextSignals.muscleRecovery.filter((m) => m.status === "fatigued").length;
  if (globalStrategy === "progress" && fatiguedMuscles >= 3) globalStrategy = "maintain";
  if (globalStrategy !== "deload" && fatigue === "high") globalStrategy = "deload";

  return { globalStrategy, exercisePlans };
}

/**
 * Recovery-aware progression planner.
 *
 * Keeps the legacy `buildProgressionPlan(coachingContextSignals)` API intact, but provides
 * a context-driven entrypoint for the CoAIch pipeline so progression can respond to
 * centralized `RecoveryState` (global fatigue + deload recommendation).
 */
export function buildProgressionPlanFromDecisionContext(
  context: AiDecisionContext,
): ProgressionPlan {
  const recovery = evaluateRecoveryState(context);
  const base = buildProgressionPlan(context.trainingSignals);

  // Global fatigue high: bias away from aggressive progression.
  if (recovery.globalFatigueLevel === "high") {
    const exercisePlans = base.exercisePlans.map((p) => {
      if (p.action === "increase_reps" || p.action === "increase_weight" || p.action === "increase_sets") {
        return {
          ...p,
          action: "maintain" as const,
          reason: cap("High fatigue: consolidate and avoid adding stress this session.", 120),
        };
      }
      return p;
    });
    return { globalStrategy: "maintain", exercisePlans };
  }

  // Deload recommended: reduce volume via reduce_sets.
  if (recovery.deloadRecommended) {
    const exercisePlans = base.exercisePlans.map((p) => ({
      ...p,
      action:
        p.action === "reduce_weight"
          ? ("reduce_weight" as const)
          : ("reduce_sets" as const),
      reason: cap(
        `Deload/recovery: reduce working sets (~${Math.round((1 - recovery.rules.deloadVolumeMultiplier) * 100)}%).`,
        120,
      ),
    }));
    return { globalStrategy: "deload", exercisePlans };
  }

  return base;
}

