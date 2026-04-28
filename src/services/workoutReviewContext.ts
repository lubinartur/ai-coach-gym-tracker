import { getOrCreateAthleteProfile } from "@/db/athleteProfile";
import { listExercises } from "@/db/exercises";
import { getOrCreateSettings } from "@/db/settings";
import { listWorkoutSessions } from "@/db/workoutSessions";
import { parseAppLanguage } from "@/i18n/language";
import { serializeAthleteProfileForAi } from "@/lib/serializeAthleteForAi";
import { normalizeExerciseName } from "@/lib/exerciseName";
import {
  buildExerciseStats,
  serializeWorkoutForAi,
} from "@/services/aiCoachContext";
import type { WorkoutReviewRequestPayload } from "@/types/aiCoach";
import type { WorkoutSession } from "@/types/trainingDiary";

const MAX_PRIOR = 5;
const MAX_SESSIONS_FOR_STATS = 20;

type WorkoutMode = NonNullable<
  WorkoutReviewRequestPayload["completedSession"]["workoutMode"]
>;

const MUSCLE_TITLE_HINTS: { key: string; patterns: RegExp[] }[] = [
  { key: "biceps", patterns: [/\bbiceps?\b/, /\bbi[ -]?ceps?\b/, /\bбицепс\b/i] },
  { key: "triceps", patterns: [/\btriceps?\b/, /\btri[ -]?ceps?\b/, /\bтрицепс\b/i] },
  { key: "shoulders", patterns: [/\bshoulders?\b/, /\bdelts?\b/, /\bплеч/i] },
  { key: "chest", patterns: [/\bchest\b/, /\bpecs?\b/, /\bгруд/i] },
  { key: "back", patterns: [/\bback\b/, /\blats?\b/, /\bспин/i] },
  { key: "legs", patterns: [/\blegs?\b/, /\bquads?\b/, /\bhamstrings?\b/, /\bног/i] },
  { key: "core", patterns: [/\bcore\b/, /\babs?\b/, /\bпресс\b/i] },
];

function matchSingleMuscleFromTitle(title: string): string | null {
  const t = (title ?? "").trim().toLowerCase();
  if (!t) return null;
  // Avoid treating common split labels as single muscle.
  if (/\bpush\b|\bpull\b|\blegs\b|\bupper\b|\blower\b/.test(t)) return null;
  let hit: string | null = null;
  for (const row of MUSCLE_TITLE_HINTS) {
    if (row.patterns.some((p) => p.test(t))) {
      // If multiple muscle hints appear, don't force single-muscle.
      if (hit && hit !== row.key) return null;
      hit = row.key;
    }
  }
  return hit;
}

function inferWorkoutMode(input: {
  title: string;
  setsByMuscle: Map<string, number>;
}): { mode: WorkoutMode; targetMuscles: string[] } {
  const title = (input.title ?? "").trim().toLowerCase();
  const entries = [...input.setsByMuscle.entries()].filter(([k]) => k && k !== "—");
  entries.sort((a, b) => b[1] - a[1]);
  const totalSets = entries.reduce((s, [, n]) => s + n, 0);
  const top = entries[0];
  const topMuscle = top?.[0] ?? "";
  const topShare = totalSets > 0 ? (top?.[1] ?? 0) / totalSets : 0;
  const distinct = entries.length;

  const isSplitTitle =
    /\bpush\b|\bpull\b|\blegs\b/.test(title) ||
    /\bupper\b|\blower\b/.test(title);
  const isFullBodyTitle = /\bfull\s*body\b|\bfull-body\b/.test(title);
  const isCustomTitle = /\bcustom\b/.test(title);
  const titleSingleMuscle = matchSingleMuscleFromTitle(title);

  // Single-muscle: strong concentration, OR clear title hint with reasonable concentration.
  if (topMuscle && ((topShare >= 0.75 && distinct <= 2) || (titleSingleMuscle && topShare >= 0.55 && distinct <= 3))) {
    const primary = titleSingleMuscle ?? topMuscle;
    return { mode: "single_muscle", targetMuscles: [primary] };
  }

  // Full-body: many distinct groups or explicit title.
  if (isFullBodyTitle || distinct >= 4) {
    return { mode: "full_body", targetMuscles: entries.slice(0, 3).map(([m]) => m) };
  }
  if (isSplitTitle) {
    return { mode: "split", targetMuscles: entries.slice(0, 2).map(([m]) => m) };
  }
  if (isCustomTitle) {
    return { mode: "custom", targetMuscles: entries.slice(0, 2).map(([m]) => m) };
  }
  // Default: if two or three groups show up, treat as a split; otherwise custom.
  if (distinct === 2 || distinct === 3) {
    return { mode: "split", targetMuscles: entries.slice(0, 2).map(([m]) => m) };
  }
  return { mode: "custom", targetMuscles: entries.slice(0, 2).map(([m]) => m) };
}

function serializeCompletedSession(
  s: WorkoutSession,
  catalog: { name: string; muscleGroup?: string; equipment?: string }[],
): WorkoutReviewRequestPayload["completedSession"] {
  const byNorm = new Map<string, { muscleGroup?: string; equipment?: string }>();
  for (const row of catalog) {
    const k = normalizeExerciseName(row.name);
    if (!k) continue;
    if (!byNorm.has(k)) byNorm.set(k, { muscleGroup: row.muscleGroup, equipment: row.equipment });
  }

  const setsByMuscle = new Map<string, number>();
  for (const ex of s.exercises) {
    const meta = byNorm.get(normalizeExerciseName(ex.name) ?? "") ?? null;
    const m = (meta?.muscleGroup ?? "—").trim().toLowerCase();
    const doneSets = ex.sets.filter((st) => st.isDone !== false).length;
    if (doneSets > 0) setsByMuscle.set(m, (setsByMuscle.get(m) ?? 0) + doneSets);
  }
  const { mode, targetMuscles } = inferWorkoutMode({ title: s.title, setsByMuscle });

  return {
    id: s.id,
    date: s.date,
    title: s.title,
    workoutMode: mode,
    targetMuscles,
    durationMin: s.durationMin,
    totalVolume: s.totalVolume,
    totalSets: s.totalSets,
    exercises: s.exercises.map((ex) => ({
      name: ex.name,
      muscleGroup: byNorm.get(normalizeExerciseName(ex.name) ?? "")?.muscleGroup,
      equipment: byNorm.get(normalizeExerciseName(ex.name) ?? "")?.equipment,
      sets: ex.sets.map((st) => ({
        weight: st.weight,
        reps: st.reps,
        volume: st.volume,
        isDone: st.isDone,
        completedAt: st.completedAt,
      })),
    })),
  };
}

/**
 * Builds a compact payload for POST /api/ai-coach/review-workout.
 * `finishedSessionId` must be a session already stored in Dexie.
 */
export async function buildWorkoutReviewRequestPayload(
  finishedSessionId: string,
): Promise<WorkoutReviewRequestPayload | null> {
  const [rows, catalog, athlete, settings] = await Promise.all([
    listWorkoutSessions(),
    listExercises(),
    getOrCreateAthleteProfile(),
    getOrCreateSettings(),
  ]);

  const idx = rows.findIndex((r) => r.id === finishedSessionId);
  if (idx === -1) return null;

  const completed = rows[idx]!;
  const priorRaw = rows.slice(idx + 1, idx + 1 + MAX_PRIOR);
  const priorSessions = priorRaw.map((s) => serializeWorkoutForAi(s, catalog));

  const favKeys = new Set(
    catalog
      .filter((e) => e.isFavorite)
      .map((e) => normalizeExerciseName(e.name))
      .filter(Boolean),
  );
  const forStats = rows.slice(0, MAX_SESSIONS_FOR_STATS);
  const exerciseStats = buildExerciseStats(forStats, favKeys);

  const logTotals = rows.reduce(
    (acc, s) => {
      acc.totalVolume += s.totalVolume;
      acc.totalSetCount += s.totalSets;
      return acc;
    },
    { totalVolume: 0, totalSetCount: 0 },
  );

  return {
    language: parseAppLanguage(settings.language),
    athleteProfile: serializeAthleteProfileForAi(athlete),
    completedSession: serializeCompletedSession(completed, catalog),
    priorSessions,
    exerciseStats,
    logTotals,
  };
}
