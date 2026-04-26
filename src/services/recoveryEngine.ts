import { PRIMARY_MUSCLE_GROUPS, type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { getExerciseMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { AiDecisionContext } from "@/types/aiCoach";

export type RecoveryMuscleState = {
  status: "ready" | "moderate" | "fatigued" | "unknown";
  recoveryScore: number;
};

export type RecoveryState = {
  globalFatigueLevel: "low" | "moderate" | "high" | "unknown";
  deloadRecommended: boolean;
  /**
   * Per primary muscle bucket (same keys used by muscle volume tracking).
   * `other` is included for completeness, but will usually remain unknown.
   */
  muscles: Record<PrimaryMuscleGroup, RecoveryMuscleState>;
  /** Muscles that should not receive heavy/compound work. */
  blockedMuscles: PrimaryMuscleGroup[];
  /** Muscles that should not receive added direct volume this week. */
  volumeCappedMuscles: PrimaryMuscleGroup[];
  /** Guidance knobs for downstream engines (selection, progression, generator). */
  rules: {
    compoundMinRecoveryScore: number;
    isolationMinRecoveryScore: number;
    heavyBlockRecoveryScore: number;
    /** If deload is recommended/active, intended set-volume multiplier (e.g. 0.6 = ~40% reduction). */
    deloadVolumeMultiplier: number;
  };
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function statusFromScore(score: number): RecoveryMuscleState["status"] {
  if (score >= 70) return "ready";
  if (score >= 40) return "moderate";
  if (score > 0) return "fatigued";
  return "unknown";
}

function parseWorkoutTimestampIso(input: { performedAt?: string; createdAt?: string; date?: string }): string | null {
  // Note: `date` is often yyyy-mm-dd without time; treat it as local midnight-ish and accept as a coarse signal.
  const iso = input.performedAt || input.createdAt || input.date || "";
  if (!iso.trim()) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function hoursSinceIso(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  const h = (Date.now() - t) / (1000 * 60 * 60);
  return Number.isFinite(h) ? Math.max(0, h) : null;
}

function effectiveRecoveryHours(muscle: PrimaryMuscleGroup, hours: number): number {
  // Intent: small muscles (arms) generally recover faster from direct work.
  // We model that as "time passes faster" for biceps/triceps.
  if (muscle === "biceps" || muscle === "triceps") return hours * 1.25;
  return hours;
}

function timeDecayBonusFromHours(hours: number): number {
  // Intent: soften harsh fatigue over time, without overriding overload signals.
  // 0–24h: no bonus (still fresh fatigue).
  // 24–72h: linear recovery ramp.
  // 72h+: near-full recovery bonus.
  if (!Number.isFinite(hours) || hours <= 24) return 0;
  if (hours >= 72) return 55;
  const frac = (hours - 24) / 48; // 24..72 -> 0..1
  return Math.max(0, Math.min(45, frac * 45));
}

function volumeDampener(weeklySets: number | null): number {
  // Keep existing volume/fatigue logic: if weekly exposure is high, don't fully "wash it away" with time.
  if (weeklySets == null) return 1;
  if (weeklySets >= 16) return 0.55;
  if (weeklySets >= 10) return 0.75;
  if (weeklySets >= 6) return 0.9;
  return 1;
}

/**
 * Centralized recovery + fatigue evaluation from `AiDecisionContext`.
 *
 * Notes:
 * - Uses the coaching engine's `trainingSignals.muscleRecovery` as the primary data source.
 * - Uses weekly volume caps (`laggingInterventionBlockers.musclesAtWeeklyVolumeMax`) to mark capped muscles.
 * - Uses `trainingPhase` + `fatigueTrend` to recommend deload and intensity/volume reductions.
 */
export function evaluateRecoveryState(context: AiDecisionContext): RecoveryState {
  const compoundMinRecoveryScore = 70;
  const isolationMinRecoveryScore = 40;
  const heavyBlockRecoveryScore = 40;
  const deloadVolumeMultiplier = 0.6; // ~= 40% reduction

  const globalFatigueLevel = context.trainingSignals?.fatigueTrend?.level ?? "unknown";
  const phase = context.trainingPhase?.phase ?? "unknown";

  // Deload rules: only explicit deload signals.
  // High fatigue remains a strong signal for load management, but is not an automatic deload.
  const deloadRecommended =
    phase === "deload" || context.progressionPlan?.globalStrategy === "deload";

  // Build "time since last trained" per primary muscle from recentWorkouts.
  // This is a UI-facing softener: it should not erase overload penalties, only help recovery progress with time.
  const lastTrainedAtByMuscle = new Map<PrimaryMuscleGroup, string>();
  for (const w of context.recentWorkouts ?? []) {
    const iso = parseWorkoutTimestampIso(w);
    if (!iso) continue;
    for (const ex of w.exercises ?? []) {
      const m = getExerciseMuscleGroup(ex.name);
      if (!lastTrainedAtByMuscle.has(m)) {
        lastTrainedAtByMuscle.set(m, iso);
      }
    }
  }

  const byMuscle = new Map<PrimaryMuscleGroup, RecoveryMuscleState>();
  for (const row of context.trainingSignals?.muscleRecovery ?? []) {
    const mg = row.muscleGroup;
    if (!mg) continue;
    const baseScore = clampScore(row.recoveryScore);
    const weeklySets =
      typeof row.weeklySets === "number" && Number.isFinite(row.weeklySets)
        ? Math.max(0, row.weeklySets)
        : null;
    const lastIso = lastTrainedAtByMuscle.get(mg) ?? null;
    const h0 = hoursSinceIso(lastIso);
    const h = h0 == null ? null : effectiveRecoveryHours(mg, h0);
    const bonus =
      h == null
        ? 0
        : timeDecayBonusFromHours(h) *
          volumeDampener(weeklySets) *
          (globalFatigueLevel === "high" ? 0.85 : globalFatigueLevel === "moderate" ? 0.95 : 1);
    const score = clampScore(baseScore + bonus);
    byMuscle.set(mg, {
      // Recompute status from adjusted score so time decay can soften harsh states.
      status: statusFromScore(score),
      recoveryScore: score,
    });
  }

  const muscles = Object.fromEntries(
    PRIMARY_MUSCLE_GROUPS.map((m) => {
      const existing = byMuscle.get(m);
      if (existing) return [m, existing] as const;
      return [m, { status: "unknown", recoveryScore: 0 }] as const;
    }),
  ) as Record<PrimaryMuscleGroup, RecoveryMuscleState>;

  const volumeCappedMuscles = (context.laggingMuscles?.laggingInterventionBlockers?.musclesAtWeeklyVolumeMax ??
    []) as PrimaryMuscleGroup[];

  const blocked = new Set<PrimaryMuscleGroup>();
  for (const m of PRIMARY_MUSCLE_GROUPS) {
    const s = muscles[m];
    if (!s) continue;
    // Heavy/compound work block rule: recoveryScore < 40.
    if (s.recoveryScore > 0 && s.recoveryScore < heavyBlockRecoveryScore) blocked.add(m);
    // If the engine explicitly marks the muscle as fatigued, block heavy work as well.
    if (s.status === "fatigued") blocked.add(m);
    // During deload, block heavy work broadly (handled downstream); we still keep the list conservative.
  }

  // If global fatigue is high, treat major muscles more conservatively for heavy work.
  if (globalFatigueLevel === "high") {
    blocked.add("chest");
    blocked.add("back");
    blocked.add("legs");
    blocked.add("shoulders");
  }

  return {
    globalFatigueLevel,
    deloadRecommended,
    muscles,
    blockedMuscles: [...blocked],
    volumeCappedMuscles: [...new Set(volumeCappedMuscles)],
    rules: {
      compoundMinRecoveryScore,
      isolationMinRecoveryScore,
      heavyBlockRecoveryScore,
      deloadVolumeMultiplier,
    },
  };
}

