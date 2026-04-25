import type {
  ProgressionPlan,
  TrainingPhaseStateForAi,
  TrainingSignalEngineOutput,
} from "@/types/aiCoach";
import type { WorkoutSession } from "@/types/trainingDiary";

function cap(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function majority<T extends string>(arr: T[]): { top: T | null; frac: number } {
  if (!arr.length) return { top: null, frac: 0 };
  const m = new Map<T, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  let best: T | null = null;
  let bestN = 0;
  for (const [k, v] of m.entries()) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return { top: best, frac: bestN / arr.length };
}

function volumeIndicatorFromRecent(workouts: WorkoutSession[]): "low" | "moderate" | "high" {
  const slice = workouts.slice(0, 6);
  if (slice.length < 2) return "moderate";
  const last = slice[0]!.totalSets ?? 0;
  const prev = slice.slice(1, 4).map((s) => s.totalSets ?? 0);
  const avgPrev = prev.reduce((a, b) => a + b, 0) / Math.max(1, prev.length);
  if (avgPrev <= 0) return "moderate";
  if (last > avgPrev * 1.12 && last >= 20) return "high";
  if (last < avgPrev * 0.88 && last <= 16) return "low";
  return "moderate";
}

function classifyPhaseNow(input: {
  trainingSignals: TrainingSignalEngineOutput;
  progressionPlan: ProgressionPlan;
}): { phase: TrainingPhaseStateForAi["phase"]; reason: string } {
  const ts = input.trainingSignals;
  const gp = input.progressionPlan.globalStrategy;
  const fatigue = ts.fatigueTrend.level;
  const alerts = ts.alerts.join(" ").toLowerCase();

  const trends = ts.exerciseTrends.map((t) => t.trend);
  const m = majority(trends);
  const improvingOrStable = trends.filter((t) => t === "improving" || t === "stable").length;
  const declining = trends.filter((t) => t === "declining").length;
  const stagnating = trends.filter((t) => t === "stagnating").length;

  if (
    gp === "deload" ||
    ts.progressionFocus === "deload" ||
    fatigue === "high" ||
    declining >= 3 ||
    alerts.includes("high fatigue")
  ) {
    return { phase: "deload", reason: "Fatigue/decline signals suggest a recovery (deload) phase." };
  }

  const maintainPlans = input.progressionPlan.exercisePlans.filter((p) => p.action === "maintain").length;
  const totalPlans = Math.max(1, input.progressionPlan.exercisePlans.length);
  const maintainFrac = maintainPlans / totalPlans;

  if (gp === "progress" && improvingOrStable >= Math.max(3, stagnating) && declining === 0) {
    return { phase: "build", reason: "Progression is prioritized and performance is holding/improving." };
  }

  if (
    (gp === "maintain" || gp === "reduce" || maintainFrac >= 0.55) &&
    (fatigue === "moderate" || (m.top === "stable" && m.frac >= 0.45) || stagnating >= 3)
  ) {
    return { phase: "consolidate", reason: "Stabilizing performance while managing moderate fatigue/stagnation." };
  }

  if (input.progressionPlan.exercisePlans.length < 3 || ts.exerciseTrends.length < 3) {
    return { phase: "unknown", reason: "Not enough recent history to infer a clear phase." };
  }

  return { phase: "consolidate", reason: "Defaulting to consolidation for stable progress and load management." };
}

function estimateWeekInPhase(workoutsInStreak: number): number {
  // Rough heuristic: 2 workouts ~= 1 week for many users; cap to keep it sane.
  return clampInt(Math.ceil(Math.max(1, workoutsInStreak) / 2), 1, 6);
}

/**
 * Lightweight “phase awareness” derived from existing signals.
 * No DB writes; does not require schema changes.
 */
export function buildTrainingPhaseState(input: {
  workoutSessions: WorkoutSession[];
  trainingSignals: TrainingSignalEngineOutput;
  progressionPlan: ProgressionPlan;
}): TrainingPhaseStateForAi {
  const { phase, reason } = classifyPhaseNow({
    trainingSignals: input.trainingSignals,
    progressionPlan: input.progressionPlan,
  });

  // Streak estimate: if deload now, treat as fresh. Else infer from globalStrategy stability.
  const gp = input.progressionPlan.globalStrategy;
  const streakWorkouts =
    phase === "deload" ? 1 : gp === "progress" ? 4 : gp === "maintain" ? 4 : 2;

  return {
    phase,
    weekInPhase: estimateWeekInPhase(streakWorkouts),
    reason: cap(reason, 140),
    fatigueIndicator: input.trainingSignals.fatigueTrend.level,
    volumeIndicator: volumeIndicatorFromRecent(input.workoutSessions),
  };
}

