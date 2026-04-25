import { normalizeExerciseName } from "@/lib/exerciseName";
import type { AthleteProfile } from "@/types/athleteProfile";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";
import type {
  AiTrainingContextPayload,
  ExerciseBaselineForAi,
  FatigueSignal,
  TrainingSignals,
  VolumeTrend,
} from "@/types/aiCoach";

const TITLE_TOKENS: { re: RegExp; tag: string }[] = [
  { re: /\bfull[-\s]?body|\bfull\s*day/i, tag: "Full body" },
  { re: /\bleg|lower\s*body|squat|hinge/i, tag: "Legs" },
  { re: /\bpush\b|chest|bench|tricep|overhead|ohp|shoulder press/i, tag: "Push" },
  { re: /\bpull\b|back|row|bicep|lat|pulldown|pullover/i, tag: "Pull" },
  { re: /\bshoulder|delt/i, tag: "Shoulders" },
  { re: /\barm\b/i, tag: "Arms" },
  { re: /\bcore|ab\b|abs\b/i, tag: "Core" },
  { re: /\bglute/i, tag: "Glutes" },
];

/**
 * Infers high-level focus tags from session titles and exercise list + optional catalog muscleGroup.
 */
function inferLastWorkedMuscleGroups(
  recentSessions: WorkoutSession[],
  nameToMuscle: Map<string, string | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    const s = t.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  for (const s of recentSessions.slice(0, 3)) {
    const t = s.title;
    for (const { re, tag } of TITLE_TOKENS) {
      if (re.test(t) || s.exercises.some((e) => re.test(e.name))) {
        add(tag);
      }
    }
    for (const ex of s.exercises) {
      const k = normalizeExerciseName(ex.name);
      const m = k ? nameToMuscle.get(k) : undefined;
      if (m && m.trim()) {
        const label = m.trim();
        const pretty =
          label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
        add(pretty);
      }
    }
  }

  return out.slice(0, 12);
}

function volumeTrendFromRows(
  rows: WorkoutSession[],
): VolumeTrend {
  if (rows.length < 2) return "unknown";
  const last = rows[0]!.totalVolume;
  const prev = rows.slice(1, 4);
  if (prev.length < 1) return "unknown";
  const avg =
    prev.reduce((sum, s) => sum + s.totalVolume, 0) / Math.max(1, prev.length);
  if (avg <= 0) return "unknown";
  if (last > avg * 1.05) return "up";
  if (last < avg * 0.95) return "down";
  return "stable";
}

function fatigueFrom(
  totalSets: number,
  volTrend: VolumeTrend,
  hasData: boolean,
): FatigueSignal {
  if (!hasData) return "unknown";
  if (totalSets > 25) return "high";
  if (volTrend === "up" && totalSets > 20) return "high";
  if (totalSets < 16) return "low";
  if (totalSets >= 16 && totalSets <= 25) return "moderate";
  return "low";
}

function buildNameToMuscle(
  catalog: Pick<Exercise, "name" | "muscleGroup">[],
): Map<string, string | undefined> {
  const m = new Map<string, string | undefined>();
  for (const e of catalog) {
    const k = normalizeExerciseName(e.name);
    if (k) m.set(k, e.muscleGroup);
  }
  return m;
}

/**
 * For each unique exercise in the last 5 sessions (order: first seen scanning newest → oldest in sessions, then exercise order), compute baselines.
 */
function buildExerciseBaselines(
  rows: WorkoutSession[],
  cap: number,
): ExerciseBaselineForAi[] {
  const sessions = rows.slice(0, 5);
  const orderedKeys: string[] = [];
  const seenK = new Set<string>();

  for (const s of sessions) {
    for (const ex of s.exercises) {
      const k = normalizeExerciseName(ex.name);
      if (!k || seenK.has(k)) continue;
      seenK.add(k);
      orderedKeys.push(k);
      if (orderedKeys.length >= cap) break;
    }
    if (orderedKeys.length >= cap) break;
  }

  const byKey = new Map<
    string,
    { displayName: string; bestV: number; bestW: number; bestR: number }
  >();
  for (const k of orderedKeys) {
    for (const s of sessions) {
      for (const ex of s.exercises) {
        if (normalizeExerciseName(ex.name) !== k) continue;
        const d = ex.name.trim() || k;
        if (!byKey.has(k)) {
          byKey.set(k, { displayName: d, bestV: 0, bestW: 0, bestR: 0 });
        }
        for (const st of ex.sets) {
          const w = Math.max(0, st.weight);
          const r = Math.max(0, st.reps);
          const v = st.volume ?? w * r;
          const b = byKey.get(k)!;
          if (v > b.bestV) {
            b.bestV = v;
            b.bestW = w;
            b.bestR = r;
          }
        }
      }
    }
  }

  const out: ExerciseBaselineForAi[] = [];
  for (const k of orderedKeys) {
    const displayName = byKey.get(k)?.displayName ?? k;
    const best = byKey.get(k);
    const bestSet =
      best && best.bestV > 0
        ? { weight: best.bestW, reps: best.bestR, volume: best.bestV }
        : null;

    let latestSets: { weight: number; reps: number; volume: number }[] = [];
    let lastSessionVolume = 0;
    for (const s of sessions) {
      const ex = s.exercises.find(
        (e) => normalizeExerciseName(e.name) === k,
      );
      if (!ex) continue;
      latestSets = ex.sets.map((st) => {
        const w = Math.max(0, st.weight);
        const r = Math.max(0, st.reps);
        const v = st.volume ?? w * r;
        return { weight: w, reps: r, volume: v };
      });
      lastSessionVolume = latestSets.reduce((a, t) => a + t.volume, 0);
      break;
    }

    out.push({
      name: displayName,
      latestSets,
      bestSet,
      lastSessionVolume: Math.round(lastSessionVolume * 100) / 100,
    });
  }

  return out;
}

const DEFAULT_TRAINING_GOAL = "strength and hypertrophy";

const GOAL_LABEL: Record<NonNullable<AthleteProfile["goal"]>, string> = {
  build_muscle: "build muscle (hypertrophy)",
  lose_fat: "lose fat",
  recomposition: "recomposition",
  strength: "strength",
  general_fitness: "general fitness",
};

/**
 * Maps profile + planning fields into a small line for the suggest-next payload.
 */
export function buildAiTrainingContext(
  athlete: AthleteProfile,
): AiTrainingContextPayload {
  const goalFromGym = athlete.goal ? GOAL_LABEL[athlete.goal] : null;
  const hasPlanningTweak =
    (athlete.phase && athlete.phase !== "natural") ||
    (athlete.offCycleDate && athlete.offCycleDate.trim().length > 0);
  const hasGym = Boolean(
    goalFromGym ||
      athlete.experience ||
      athlete.equipment ||
      (athlete.notes && athlete.notes.trim()) ||
      (athlete.limitations && athlete.limitations.length),
  );
  if (!hasPlanningTweak && !hasGym) {
    return {
      trainingPhase: "normal",
      goal: DEFAULT_TRAINING_GOAL,
      progressionMode: "progressive overload",
    };
  }
  return {
    trainingPhase:
      !athlete.phase || athlete.phase === "natural" ? "normal" : athlete.phase,
    goal: goalFromGym || DEFAULT_TRAINING_GOAL,
    progressionMode: "progressive overload",
    userNotesFromSettings: athlete.notes?.trim() || undefined,
    offCycleDate: athlete.offCycleDate?.trim() || undefined,
  };
}

export function computeTrainingSignals(
  rows: WorkoutSession[],
  catalog: Pick<Exercise, "name" | "muscleGroup">[],
): TrainingSignals {
  const nameToMuscle = buildNameToMuscle(catalog);
  const recentSplitPattern = rows
    .slice(0, 5)
    .map((s) => s.title.trim() || "Workout");

  const lastWorkedMuscleGroups = inferLastWorkedMuscleGroups(
    rows,
    nameToMuscle,
  );
  const volumeTrend = volumeTrendFromRows(rows);
  const hasData = rows.length >= 1;
  const lastSets = hasData ? rows[0]!.totalSets : 0;
  const fatigueSignal = fatigueFrom(
    lastSets,
    volumeTrend,
    hasData,
  );
  const exerciseBaselines = buildExerciseBaselines(rows, 24);

  return {
    recentSplitPattern,
    lastWorkedMuscleGroups,
    volumeTrend,
    fatigueSignal,
    exerciseBaselines,
  };
}
