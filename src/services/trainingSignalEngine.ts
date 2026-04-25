import { buildCatalogLookup, resolvePrimaryMuscle } from "@/lib/muscleVolumeAnalysis";
import type {
  ExerciseProgressionForAi,
  ExerciseProgressionTrend,
  TrainingSignalEngineOutput,
  TrainingSignalExerciseTrend,
  TrainingSignalFatigueTrend,
  TrainingSignalMuscleRecovery,
} from "@/types/aiCoach";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";
import { getCalendarDateInTimezone } from "@/lib/dates";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";

const MAJOR_MUSCLES: PrimaryMuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "legs",
  "biceps",
  "triceps",
  "core",
];

function formatBestSet(w: number, r: number): string {
  const ww = Math.round(w * 100) / 100;
  return `${ww}×${Math.round(r)}`;
}

function cap(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

function aggregateFatigueTrend(input: {
  fatigueSignal: "low" | "moderate" | "high" | "unknown";
  volumeTrend: "up" | "down" | "stable" | "unknown";
  exerciseProgression: ExerciseProgressionForAi[];
  laggingBlockersHighFatigue?: boolean;
  todayYmd: string;
}): TrainingSignalFatigueTrend {
  const reasons: string[] = [];
  if (input.laggingBlockersHighFatigue) reasons.push("High fatigue signal.");
  if (input.volumeTrend === "up") reasons.push("Recent session volume is above baseline.");
  const repDropCount = input.exerciseProgression.filter((p) =>
    p.history.slice(-2).some((h) => h.inSessionRepDrop > 3),
  ).length;
  if (repDropCount >= 3) reasons.push("Repeated large rep drops across exercises.");
  const decliningCount = input.exerciseProgression.filter((p) => p.trend === "declining").length;
  if (decliningCount >= 2) reasons.push("Multiple exercises are declining.");

  let level: TrainingSignalFatigueTrend["level"] = "unknown";
  if (input.fatigueSignal === "high") level = "high";
  else if (input.fatigueSignal === "moderate") level = "moderate";
  else if (input.fatigueSignal === "low") level = "low";
  else level = "unknown";

  // If signal is unknown, infer softly from reasons.
  if (level === "unknown") {
    if (reasons.length >= 2) level = "moderate";
  }

  return { level, reasons: reasons.slice(0, 6) };
}

function progressionFocusFrom(
  fatigue: TrainingSignalFatigueTrend["level"],
  periodPhase: "moderate" | "progression" | "peak" | "deload",
): TrainingSignalEngineOutput["progressionFocus"] {
  if (periodPhase === "deload") return "deload";
  if (fatigue === "high") return "reduce";
  if (fatigue === "moderate") return "maintain";
  if (fatigue === "low") return periodPhase === "peak" ? "progress" : "progress";
  return "maintain";
}

function buildExerciseTrends(
  exerciseProgression: ExerciseProgressionForAi[],
): TrainingSignalExerciseTrend[] {
  const out: TrainingSignalExerciseTrend[] = [];
  for (const p of exerciseProgression.slice(0, 12)) {
    const h = p.history;
    const last = h[h.length - 1];
    const prev = h.length >= 2 ? h[h.length - 2] : undefined;
    const lastBestSet = last ? formatBestSet(last.topWeight, last.topReps) : "—";
    const previousBestSet = prev ? formatBestSet(prev.topWeight, prev.topReps) : undefined;
    const trend: ExerciseProgressionTrend = p.trend;

    let note = "";
    if (p.stimulusInterpretation === "poor" || p.stimulusBelowFiveLastThreeSessions) {
      note = "Stimulus has been low recently; consider a close variation or technique focus.";
    } else if (trend === "stagnating") {
      note = "Stalled 3+ sessions; consider reps/sets/variation depending on fatigue.";
    } else if (trend === "declining") {
      note = "Performance slipping; consolidate or reduce stress.";
    } else if (trend === "improving") {
      note = "Progressing cleanly; continue single-variable progression.";
    } else if (trend === "stable") {
      note = "Stable; progress reps first when appropriate.";
    }
    out.push({
      exerciseName: p.name,
      trend,
      lastBestSet,
      previousBestSet,
      note: cap(note, 140),
    });
  }
  return out;
}

function findLastTrainedAtForMuscle(
  muscle: PrimaryMuscleGroup,
  sessions: WorkoutSession[],
  catalog: Exercise[],
): string | undefined {
  const lookup = buildCatalogLookup(catalog);
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const m = resolvePrimaryMuscle(ex, lookup);
      if (m === muscle) {
        return s.createdAt || s.updatedAt || undefined;
      }
    }
  }
  return undefined;
}

function hoursSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function recoveryScoreForMuscle(input: {
  muscle: PrimaryMuscleGroup;
  lastTrainedAt?: string;
  weeklySets: number;
  weeklyMax: number | null;
  relatedRepDropCount: number;
}): { score: number; status: TrainingSignalMuscleRecovery["status"]; note: string } {
  let score = 100;
  const h = hoursSince(input.lastTrainedAt);
  if (h != null && h < 24) score -= 40;
  else if (h != null && h < 48) score -= 20;

  if (input.weeklyMax != null && input.weeklyMax > 0) {
    const frac = Math.min(1, input.weeklySets / input.weeklyMax);
    score -= Math.round(35 * frac);
  } else {
    score -= Math.min(25, Math.round(input.weeklySets * 1.5));
  }

  if (input.relatedRepDropCount >= 2) score -= 15;
  else if (input.relatedRepDropCount >= 1) score -= 8;

  score = Math.max(0, Math.min(100, score));
  let status: TrainingSignalMuscleRecovery["status"] = "unknown";
  if (score >= 70) status = "ready";
  else if (score >= 45) status = "moderate";
  else status = "fatigued";

  let note = "";
  if (h != null && h < 24) note = "Trained very recently (<24h).";
  else if (input.weeklySets >= 16) note = "High weekly set exposure.";
  else if (status === "ready") note = "Recovery appears good for direct work.";
  else if (status === "fatigued") note = "Consider reducing direct volume and emphasizing technique.";

  return { score, status, note: cap(note, 120) };
}

export function buildTrainingSignals(input: {
  workoutSessions: WorkoutSession[];
  catalog: Exercise[];
  timeZone: string;
  exerciseProgression: ExerciseProgressionForAi[];
  fatigueSignal: "low" | "moderate" | "high" | "unknown";
  volumeTrend: "up" | "down" | "stable" | "unknown";
  weeklyMuscleVolume: Record<PrimaryMuscleGroup, number>;
  muscleHypertrophyRanges: Partial<Record<PrimaryMuscleGroup, { min: number; max: number }>>;
  periodizationPhase: "moderate" | "progression" | "peak" | "deload";
  laggingBlockersHighFatigue?: boolean;
}): TrainingSignalEngineOutput {
  const todayYmd = getCalendarDateInTimezone(new Date(), input.timeZone);
  const exerciseTrends = buildExerciseTrends(input.exerciseProgression);

  const fatigueTrend = aggregateFatigueTrend({
    fatigueSignal: input.fatigueSignal,
    volumeTrend: input.volumeTrend,
    exerciseProgression: input.exerciseProgression,
    laggingBlockersHighFatigue: input.laggingBlockersHighFatigue,
    todayYmd,
  });

  const progressionFocus = progressionFocusFrom(fatigueTrend.level, input.periodizationPhase);

  const alerts: string[] = [];
  if (fatigueTrend.level === "high") alerts.push("High fatigue: consider deload or reduce volume.");
  const weakStim = input.exerciseProgression.filter((p) => p.stimulusScore < 5).length;
  if (weakStim >= 3) alerts.push("Several exercises show weak stimulus; consider variations/technique blocks.");

  const lookup = buildCatalogLookup(input.catalog);
  const primaryByKey = new Map<string, PrimaryMuscleGroup>();
  for (const p of input.exerciseProgression) {
    const key = normalizeExerciseName(p.name);
    if (!key) continue;
    // Find latest occurrence to resolve muscle; fallback is ok for recovery scoring.
    let found: PrimaryMuscleGroup | null = null;
    for (const s of input.workoutSessions) {
      const ex = s.exercises.find((e) => normalizeExerciseName(e.name) === key);
      if (ex) {
        found = resolvePrimaryMuscle(ex, lookup);
        break;
      }
    }
    primaryByKey.set(key, found ?? "other");
  }

  const muscleRecovery: TrainingSignalMuscleRecovery[] = [];
  for (const muscle of MAJOR_MUSCLES) {
    const lastTrainedAt = findLastTrainedAtForMuscle(muscle, input.workoutSessions, input.catalog);
    const weeklySets = input.weeklyMuscleVolume[muscle] ?? 0;
    const weeklyMax = input.muscleHypertrophyRanges[muscle]?.max ?? null;
    const relatedRepDropCount = input.exerciseProgression.filter((p) => {
      const k = normalizeExerciseName(p.name);
      const m = k ? primaryByKey.get(k) : undefined;
      if (m !== muscle) return false;
      return p.history.slice(-2).some((h) => h.inSessionRepDrop > 3);
    }).length;

    const { score, status, note } = recoveryScoreForMuscle({
      muscle,
      lastTrainedAt,
      weeklySets,
      weeklyMax,
      relatedRepDropCount,
    });

    muscleRecovery.push({
      muscleGroup: muscle,
      recoveryScore: score,
      status,
      lastTrainedAt,
      weeklySets,
      note,
    });
  }

  return {
    exerciseTrends,
    muscleRecovery,
    fatigueTrend,
    progressionFocus,
    alerts: alerts.slice(0, 6),
  };
}

