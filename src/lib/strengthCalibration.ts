import type { AthleteExperience, StrengthCalibration } from "@/types/athleteProfile";

export function estimateOneRepMax(weight: number, reps: number): number {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return 0;
  if (!Number.isFinite(r) || r <= 0) return 0;
  return w * (1 + r / 30);
}

function roundTo2p5(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x / 2.5) * 2.5;
}

function pctRangeForExperience(exp: AthleteExperience | undefined): {
  min: number;
  max: number;
  mid: number;
} {
  if (exp === "beginner") return { min: 0.65, max: 0.7, mid: 0.675 };
  if (exp === "advanced") return { min: 0.72, max: 0.77, mid: 0.745 };
  return { min: 0.7, max: 0.75, mid: 0.725 };
}

/** Estimated working weight (experience-based), rounded to nearest 2.5kg. */
export function estimateWorkingWeight(input: {
  oneRepMax: number;
  experience?: AthleteExperience;
}): number {
  const orm = Number(input.oneRepMax);
  if (!Number.isFinite(orm) || orm <= 0) return 0;
  const pct = pctRangeForExperience(input.experience).mid;
  return roundTo2p5(orm * pct);
}

export type CalibratedLiftKey =
  | "benchPress"
  | "squatOrLegPress"
  | "deadliftOrRdl"
  | "latPulldownOrPullup"
  | "shoulderPress";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function experienceCapPct(exp: AthleteExperience | undefined): number {
  return exp === "beginner" ? 0.7 : 0.75;
}

function reducePctForLimitations(input: {
  limitations?: string[];
  affected: string[];
}): number {
  const lim = (input.limitations ?? []).map((s) => String(s).toLowerCase());
  const hits = input.affected.filter((k) => lim.includes(k)).length;
  if (hits <= 0) return 1;
  if (hits === 1) return 0.9;
  return 0.85;
}

export function estimateFirstWorkoutWorkingWeightFromCalibration(input: {
  calibration?: StrengthCalibration;
  liftKey: CalibratedLiftKey;
  experience?: AthleteExperience;
  limitations?: string[];
  /** Additional conservative cap for some lifts (e.g. deadlift/RDL): default 1 */
  extraCapPct?: number;
}): number | null {
  const entry = input.calibration?.[input.liftKey];
  if (!entry) return null;
  const orm = estimateOneRepMax(entry.weight, entry.reps);
  if (!orm) return null;

  const base = estimateWorkingWeight({ oneRepMax: orm, experience: input.experience });
  const capPct = Math.min(
    experienceCapPct(input.experience),
    clamp01(input.extraCapPct ?? 1),
    0.75,
  );
  const capWeight = roundTo2p5(orm * capPct);
  const afterCaps = Math.min(base, capWeight);

  const injuryMult = reducePctForLimitations({
    limitations: input.limitations,
    affected: (() => {
      switch (input.liftKey) {
        case "benchPress":
          return ["shoulders", "elbows"];
        case "squatOrLegPress":
          return ["knees", "lower_back"];
        case "deadliftOrRdl":
          return ["lower_back"];
        case "latPulldownOrPullup":
          return ["shoulders", "elbows"];
        case "shoulderPress":
          return ["shoulders", "elbows"];
        default:
          return [];
      }
    })(),
  });

  const final = roundTo2p5(afterCaps * injuryMult);
  return final > 0 ? final : null;
}

export type CalibrationEstimate = {
  weight: number;
  sourceLift: CalibratedLiftKey;
  note?: string;
};

function isUnilateralOrSingleLeg(name: string): boolean {
  const s = name.toLowerCase();
  return (
    s.includes("bulgarian") ||
    s.includes("split squat") ||
    s.includes("lunge") ||
    s.includes("step-up") ||
    s.includes("step up") ||
    s.includes("single-leg") ||
    s.includes("single leg")
  );
}

function isIsolationOrAccessory(name: string): boolean {
  const s = name.toLowerCase();
  return (
    s.includes("fly") ||
    s.includes("pec deck") ||
    s.includes("cable fly") ||
    s.includes("lateral raise") ||
    s.includes("front raise") ||
    s.includes("rear delt") ||
    s.includes("calf") ||
    s.includes("curl") ||
    s.includes("pushdown") ||
    s.includes("triceps") ||
    s.includes("biceps") ||
    s.includes("extension") ||
    s.includes("leg extension") ||
    s.includes("leg curl") ||
    s.includes("hamstring curl")
  );
}

/**
 * Horizontal / bench-press family for onboarding bench calibration.
 * Excludes vertical press (OHP) and similar; does not match "shoulder press" without "bench".
 */
export function isBenchPressCalibrationName(name: string): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (/\b(overhead|ohp|arnold)\b/.test(n)) return false;
  if (/\bshoulder press\b/.test(n) && !/\bbench\b/.test(n)) return false;

  return (
    /(?:^|\s)(?:flat\s+)?bench\s+press/.test(n) ||
    /barbell\s+bench(\s+press)?/.test(n) ||
    /flat\s+bench(\s+press)?/.test(n) ||
    /incline\s+bench\s+press/.test(n) ||
    /incline\s+barbell\s+press/.test(n) ||
    /smith\s+bench(\s+press)?/.test(n) ||
    /dumbbell\s+bench(\s+press)?/.test(n) ||
    /\bdb\s+bench(\s+press)?/.test(n) ||
    /incline\s+dumbbell\s+press/.test(n) ||
    /machine\s+chest\s+press/.test(n) ||
    /(^|[^a-z0-9])chest\s+press([^a-z0-9]|$)/.test(n)
  );
}

/**
 * High-level mapping from generated exercise names to calibration categories.
 * Returns null if we should not infer loads from calibration.
 */
export function estimateBaselineWeightForExerciseFromCalibration(input: {
  exerciseName: string;
  calibration?: StrengthCalibration;
  experience?: AthleteExperience;
  limitations?: string[];
}): CalibrationEstimate | null {
  const n = String(input.exerciseName ?? "").trim().toLowerCase();
  if (!n) return null;

  // Explicit "do not map" cases.
  if (/leg curl|hamstring curl/.test(n)) return null;

  const benchLike = isBenchPressCalibrationName(n);
  const squatLike =
    /squat|leg press|hack squat|bulgarian split squat|split squat|lunge/.test(n);
  const deadliftLike = /deadlift|romanian deadlift|\brdl\b|hip thrust/.test(n);
  const latLike =
    /lat pulldown|pulldown|pull[- ]?up|chin[- ]?up|seated row|barbell row|chest[- ]supported row|machine row|cable row/.test(
      n,
    );
  const shoulderLike =
    /overhead press|\bohp\b|dumbbell shoulder press|shoulder press|machine shoulder press/.test(
      n,
    );

  const unilateral = isUnilateralOrSingleLeg(n);
  const isolation = isIsolationOrAccessory(n);
  const hipThrust = /hip thrust/.test(n);

  // Variation scaling for movements that aren't 1:1 with the calibrated lift.
  // (Applied AFTER calibration caps, then rounded to 2.5kg.)
  const variationScaling = (() => {
    // Bench variations
    if (/incline dumbbell press/.test(n)) return 0.65; // 60–70%
    if (/incline barbell press/.test(n)) return 0.65; // 60–70%
    if (/machine chest press/.test(n)) return 0.75; // 70–80%
    if (/cable fly|pec deck|fly/.test(n)) return 0.45; // 40–50%

    // Lat pulldown variations
    if (/seated row/.test(n)) return 0.85; // 80–90%

    // Deadlift/RDL variations
    if (/hip thrust/.test(n)) return 0.65; // 60–70%

    // Squat/leg press variations (unilateral patterns)
    if (/bulgarian split squat|split squat|lunge/.test(n)) return 0.55; // 50–60%

    return 1;
  })();

  // Additional conservative scaling for generic unilateral / isolation patterns.
  // Hip thrust should be treated as compound: do not apply pattern scaling.
  const patternScaling = hipThrust ? 1 : unilateral ? 0.55 : isolation ? 0.5 : 1;
  const scale = variationScaling * patternScaling;

  if (benchLike) {
    const w = estimateFirstWorkoutWorkingWeightFromCalibration({
      calibration: input.calibration,
      liftKey: "benchPress",
      experience: input.experience,
      limitations: input.limitations,
    });
    if (!w) return null;
    const out = roundTo2p5(w * scale);
    return out > 0
      ? { weight: out, sourceLift: "benchPress" }
      : null;
  }

  if (squatLike) {
    const w = estimateFirstWorkoutWorkingWeightFromCalibration({
      calibration: input.calibration,
      liftKey: "squatOrLegPress",
      experience: input.experience,
      limitations: input.limitations,
    });
    if (!w) return null;
    const out = roundTo2p5(w * scale);
    return out > 0 ? { weight: out, sourceLift: "squatOrLegPress" } : null;
  }

  if (deadliftLike) {
    const w = estimateFirstWorkoutWorkingWeightFromCalibration({
      calibration: input.calibration,
      liftKey: "deadliftOrRdl",
      experience: input.experience,
      limitations: input.limitations,
      extraCapPct: 0.7,
    });
    if (!w) return null;
    const out = roundTo2p5(w * scale);
    return out > 0 ? { weight: out, sourceLift: "deadliftOrRdl" } : null;
  }

  if (latLike) {
    const w = estimateFirstWorkoutWorkingWeightFromCalibration({
      calibration: input.calibration,
      liftKey: "latPulldownOrPullup",
      experience: input.experience,
      limitations: input.limitations,
    });
    if (!w) return null;
    const out = roundTo2p5(w * scale);
    return out > 0 ? { weight: out, sourceLift: "latPulldownOrPullup" } : null;
  }

  if (shoulderLike) {
    const w = estimateFirstWorkoutWorkingWeightFromCalibration({
      calibration: input.calibration,
      liftKey: "shoulderPress",
      experience: input.experience,
      limitations: input.limitations,
    });
    if (!w) return null;
    const out = roundTo2p5(w * scale);
    return out > 0 ? { weight: out, sourceLift: "shoulderPress" } : null;
  }

  return null;
}

