import type {
  AdaptiveVolumePlanForAi,
  SplitSelectionPlanForAi,
  TrainingPhaseStateForAi,
  TrainingSignalEngineOutput,
  TrainingSignals,
} from "@/types/aiCoach";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";

type SplitLabel = "Push" | "Pull" | "Legs" | "Full" | "Unknown";

const SPLIT_MUSCLES: Record<
  Exclude<SplitLabel, "Unknown">,
  PrimaryMuscleGroup[]
> = {
  Push: ["chest", "shoulders", "triceps"],
  Pull: ["back", "biceps"],
  Legs: ["legs", "calves"],
  Full: ["chest", "back", "shoulders", "legs", "biceps", "triceps", "core"],
};

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function muscleRecoveryScore(
  muscle: PrimaryMuscleGroup,
  muscleRecovery: TrainingSignalEngineOutput["muscleRecovery"],
): { delta: number; reason?: string } {
  const row = muscleRecovery.find((r) => r.muscleGroup === muscle);
  if (!row) return { delta: 0 };
  if (row.status === "ready") return { delta: 20, reason: `${muscle}: recovered` };
  if (row.status === "moderate") return { delta: 5, reason: `${muscle}: moderate recovery` };
  if (row.status === "fatigued") return { delta: -25, reason: `${muscle}: fatigued` };
  return { delta: 0 };
}

function volumePlanDelta(
  muscle: PrimaryMuscleGroup,
  volumePlan: AdaptiveVolumePlanForAi,
): { delta: number; reason?: string } {
  const row = volumePlan.muscleVolume.find((r) => r.muscleGroup === muscle);
  if (!row) return { delta: 0 };
  if (row.status === "low") return { delta: 15, reason: `${muscle}: low weekly volume` };
  if (row.status === "optimal")
    return { delta: 5, reason: `${muscle}: optimal weekly volume` };
  if (row.status === "high") return { delta: -20, reason: `${muscle}: high weekly volume` };
  return { delta: 0 };
}

function recoveryStatusForMuscle(
  muscle: PrimaryMuscleGroup,
  muscleRecovery: TrainingSignalEngineOutput["muscleRecovery"],
): TrainingSignalEngineOutput["muscleRecovery"][number]["status"] | null {
  const row = muscleRecovery.find((r) => r.muscleGroup === muscle);
  return row?.status ?? null;
}

function laggingDelta(
  muscles: PrimaryMuscleGroup[],
  laggingMuscles: { laggingMuscleGroups: PrimaryMuscleGroup[] },
  fatigueSignals: TrainingSignals,
): { delta: number; reasons: string[] } {
  if (fatigueSignals.fatigueSignal === "high") return { delta: 0, reasons: [] };
  const lagging = new Set(laggingMuscles.laggingMuscleGroups ?? []);
  const hits = muscles.filter((m) => lagging.has(m));
  if (hits.length === 0) return { delta: 0, reasons: [] };
  const capped = Math.min(30, hits.length * 15);
  return {
    delta: capped,
    reasons: [`targets lagging muscle(s): ${uniq(hits).join(", ")}`],
  };
}

function phaseDelta(
  phase: TrainingPhaseStateForAi["phase"],
  split: Exclude<SplitLabel, "Unknown">,
  muscles: PrimaryMuscleGroup[],
  muscleRecovery: TrainingSignalEngineOutput["muscleRecovery"],
  volumePlan: AdaptiveVolumePlanForAi,
): { delta: number; reasons: string[] } {
  if (phase === "build") {
    // Favor low-volume or lag-friendly opportunities.
    const low = muscles.filter((m) => volumePlan.muscleVolume.find((r) => r.muscleGroup === m)?.status === "low");
    if (low.length) return { delta: 8, reasons: [`build phase: opportunity on low-volume (${uniq(low).join(", ")})`] };
    return { delta: 0, reasons: [] };
  }
  if (phase === "consolidate") {
    const ready = muscles.filter((m) => muscleRecovery.find((r) => r.muscleGroup === m)?.status === "ready");
    if (ready.length) return { delta: 6, reasons: [`consolidate: favor recovered muscles (${uniq(ready).join(", ")})`] };
    return { delta: 0, reasons: [] };
  }
  if (phase === "deload") {
    // Prefer lower-stress option; Full is allowed but should be light.
    if (split === "Full") return { delta: 4, reasons: ["deload: full-body light is acceptable"] };
    // Slightly prefer smaller splits over full if we have any fatigued muscles.
    const fatigued = muscles.filter((m) => muscleRecovery.find((r) => r.muscleGroup === m)?.status === "fatigued");
    if (fatigued.length) return { delta: -8, reasons: [`deload: avoid fatigued muscles (${uniq(fatigued).join(", ")})`] };
    return { delta: 0, reasons: [] };
  }
  return { delta: 0, reasons: [] };
}

function globalFatigueDelta(
  fatigue: TrainingSignals["fatigueSignal"],
  split: Exclude<SplitLabel, "Unknown">,
  muscles: PrimaryMuscleGroup[],
  muscleRecovery: TrainingSignalEngineOutput["muscleRecovery"],
): { delta: number; reasons: string[] } {
  if (fatigue !== "high" && fatigue !== "moderate") return { delta: 0, reasons: [] };

  if (fatigue === "high") {
    const fatigued = muscles.filter((m) => muscleRecovery.find((r) => r.muscleGroup === m)?.status === "fatigued");
    if (split === "Full") {
      return { delta: -12, reasons: ["high fatigue: avoid full-body stress"] };
    }
    if (fatigued.length) {
      return { delta: -10, reasons: [`high fatigue: targets fatigued muscle(s) (${uniq(fatigued).join(", ")})`] };
    }
    return { delta: 6, reasons: ["high fatigue: smaller split with no fatigued targets"] };
  }

  // moderate fatigue
  const fatigued = muscles.filter((m) => muscleRecovery.find((r) => r.muscleGroup === m)?.status === "fatigued");
  if (fatigued.length) {
    return { delta: -6, reasons: [`moderate fatigue: avoid fatigued muscle(s) (${uniq(fatigued).join(", ")})`] };
  }
  return { delta: 0, reasons: [] };
}

function splitHasFatiguedMuscle(
  split: Exclude<SplitLabel, "Unknown">,
  muscleRecovery: TrainingSignalEngineOutput["muscleRecovery"],
): boolean {
  const muscles = SPLIT_MUSCLES[split] ?? [];
  return muscles.some(
    (m) => recoveryStatusForMuscle(m, muscleRecovery) === "fatigued",
  );
}

export function buildSplitSelectionPlan(input: {
  preferredNextSplits: ("Push" | "Pull" | "Legs" | "Full")[];
  muscleRecovery: TrainingSignalEngineOutput["muscleRecovery"];
  volumePlan: AdaptiveVolumePlanForAi;
  laggingMuscles: { laggingMuscleGroups: PrimaryMuscleGroup[] };
  fatigueSignals: TrainingSignals;
  trainingPhase: TrainingPhaseStateForAi;
}): SplitSelectionPlanForAi {
  const candidates = (input.preferredNextSplits?.length
    ? input.preferredNextSplits
    : ["Push", "Pull", "Legs", "Full"]) as ("Push" | "Pull" | "Legs" | "Full")[];

  const scored = candidates.map((split) => {
    const muscles = SPLIT_MUSCLES[split];
    let score = 50;
    const reasons: string[] = [];

    // Recovery + volume: per muscle
    for (const m of muscles) {
      const r = muscleRecoveryScore(m, input.muscleRecovery);
      if (r.delta !== 0) {
        score += r.delta;
        if (r.reason) reasons.push(r.reason);
      }
      const status = recoveryStatusForMuscle(m, input.muscleRecovery);
      // Rule: fatigued muscles should not receive low/optimal volume bonuses.
      if (status !== "fatigued") {
        const v = volumePlanDelta(m, input.volumePlan);
        if (v.delta !== 0) {
          score += v.delta;
          if (v.reason) reasons.push(v.reason);
        }
      }
    }

    // Lagging (only if global fatigue not high)
    const lag = laggingDelta(muscles, input.laggingMuscles, input.fatigueSignals);
    if (lag.delta !== 0) {
      score += lag.delta;
      reasons.push(...lag.reasons);
    }

    // Global fatigue adjustments
    const gf = globalFatigueDelta(
      input.fatigueSignals.fatigueSignal,
      split,
      muscles,
      input.muscleRecovery,
    );
    if (gf.delta !== 0) {
      score += gf.delta;
      reasons.push(...gf.reasons);
    }

    // Phase adjustments
    const ph = phaseDelta(
      input.trainingPhase.phase,
      split,
      muscles,
      input.muscleRecovery,
      input.volumePlan,
    );
    if (ph.delta !== 0) {
      score += ph.delta;
      reasons.push(...ph.reasons);
    }

    return { split, score: Math.round(score), reasons: uniq(reasons) };
  });

  scored.sort((a, b) => b.score - a.score);
  const nonFatigued = scored.filter(
    (c) => !splitHasFatiguedMuscle(c.split, input.muscleRecovery),
  );
  const pickFrom = nonFatigued.length > 0 ? nonFatigued : scored;
  const top = pickFrom[0];

  const recommendedSplit: SplitSelectionPlanForAi["recommendedSplit"] =
    top?.split ?? "Unknown";
  const avoidedFatigued =
    nonFatigued.length > 0 && splitHasFatiguedMuscle(scored[0]!.split, input.muscleRecovery);
  const reasonCore =
    top && top.reasons.length
      ? top.reasons.slice(0, 2).join("; ")
      : "No strong split signal; defaulting to the first allowed option.";
  const reason = avoidedFatigued
    ? `Avoided fatigued split(s); selecting ${recommendedSplit}. ${reasonCore}`.trim()
    : reasonCore;

  return {
    recommendedSplit,
    candidates: scored,
    reason,
  };
}

