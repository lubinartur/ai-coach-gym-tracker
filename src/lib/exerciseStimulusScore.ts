import type {
  ExerciseProgressionForAi,
  ExerciseProgressionForAiBase,
  FatigueSignal,
  StimulusComponents,
  StimulusInterpretation,
} from "@/types/aiCoach";

const RAW_ADD = 4; /** Map raw sum in about [-4,6] to [0,10] via (raw+RAW_ADD). */

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fatiguePenalty(f: FatigueSignal): number {
  if (f === "low") return 0;
  if (f === "moderate") return -1;
  if (f === "high") return -2;
  return 0;
}

function progressScore(
  h: { topWeight: number; topReps: number }[],
): number {
  if (h.length < 2) return 0;
  const a = h[0]!;
  const b = h[h.length - 1]!;
  if (b.topWeight > a.topWeight + 0.1) return 2;
  if (b.topReps > a.topReps + 0.1 && b.topWeight >= a.topWeight - 0.25) {
    return 1;
  }
  if (b.topReps < a.topReps - 0.1 && b.topWeight <= a.topWeight + 0.1) {
    return -1;
  }
  return 0;
}

function repConsistencyFromDrops(drops: number[]): number {
  if (drops.length === 0) return 0;
  const m = mean(drops);
  if (m <= 1) return 2;
  if (m <= 3) return 1;
  return -1;
}

function volumeScoreFrom(p: ExerciseProgressionForAiBase): number {
  if (p.volumeFalling3Sessions) return 0;
  const c = p.history.map((h) => h.inRepTargetWorkingSets);
  if (c.length === 0) return 0;
  if (c.every((n) => n < 2)) return 0;
  const spread = Math.max(...c) - Math.min(...c);
  if (spread === 0 && c[0]! >= 2) return 2;
  if (c.every((n) => n >= 2) && spread <= 1) return 2;
  if (c.every((n) => n >= 1)) return 1;
  return 0;
}

function rawTo10(raw: number): number {
  return round1(Math.min(10, Math.max(0, raw + RAW_ADD)));
}

function interpret(score: number): StimulusInterpretation {
  if (Number.isNaN(score)) return "unknown";
  if (score >= 8) return "strong";
  if (score >= 6) return "acceptable";
  if (score >= 4) return "weak";
  if (score > 0) return "poor";
  return "poor";
}

/**
 * One-session 0–10 (same four-part rubric, progress=0) for the three-session-under-5 streak rule.
 */
function singleSessionRaw(
  h: {
    inSessionRepDrop: number;
    inRepTargetWorkingSets: number;
  },
  fatigue: FatigueSignal,
): number {
  let rep: number;
  if (h.inSessionRepDrop <= 1) rep = 2;
  else if (h.inSessionRepDrop <= 3) rep = 1;
  else rep = -1;
  let vol: number;
  if (h.inRepTargetWorkingSets >= 3) vol = 2;
  else if (h.inRepTargetWorkingSets >= 2) vol = 1;
  else vol = 0;
  return 0 + rep + vol + fatiguePenalty(fatigue);
}

function lastThreeSessionScoresBelow5(
  p: ExerciseProgressionForAiBase,
  fatigue: FatigueSignal,
): boolean {
  const h = p.history;
  if (h.length < 3) return false;
  const last3 = h.slice(-3);
  for (const row of last3) {
    const s = rawTo10(singleSessionRaw(row, fatigue));
    if (s >= 5) return false;
  }
  return true;
}

export function computeStimulusForExercise(
  p: ExerciseProgressionForAiBase,
  fatigue: FatigueSignal,
): {
  stimulusScore: number;
  stimulusComponents: StimulusComponents;
  stimulusInterpretation: StimulusInterpretation;
  stimulusBelowFiveLastThreeSessions: boolean;
} {
  const ps = progressScore(
    p.history.map((h) => ({ topWeight: h.topWeight, topReps: h.topReps })),
  );
  const rc = repConsistencyFromDrops(p.history.map((h) => h.inSessionRepDrop));
  const vs = volumeScoreFrom(p);
  const fp = fatiguePenalty(fatigue);
  const rawSum = ps + rc + vs + fp;
  const stimulusScore = p.history.length === 0 ? 0 : rawTo10(rawSum);
  return {
    stimulusScore,
    stimulusComponents: {
      progressScore: ps,
      repConsistency: rc,
      volumeScore: vs,
      fatiguePenalty: fp,
      rawSum,
    },
    stimulusInterpretation:
      p.history.length < 2 ? "unknown" : interpret(stimulusScore),
    stimulusBelowFiveLastThreeSessions: lastThreeSessionScoresBelow5(p, fatigue),
  };
}

/**
 * Merges stimulus into progression rows; keeps ordering. No Dexie.
 */
export function enrichProgressionWithStimulus(
  rows: ExerciseProgressionForAiBase[],
  fatigue: FatigueSignal,
): ExerciseProgressionForAi[] {
  return rows.map((p) => {
    const s = computeStimulusForExercise(p, fatigue);
    return {
      ...p,
      ...s,
    };
  });
}

export const DEFAULT_STIMULUS: Pick<
  ExerciseProgressionForAi,
  | "stimulusScore"
  | "stimulusComponents"
  | "stimulusInterpretation"
  | "stimulusBelowFiveLastThreeSessions"
> = {
  stimulusScore: 0,
  stimulusComponents: {
    progressScore: 0,
    repConsistency: 0,
    volumeScore: 0,
    fatiguePenalty: 0,
    rawSum: 0,
  },
  stimulusInterpretation: "unknown",
  stimulusBelowFiveLastThreeSessions: false,
};
