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

function serializeCompletedSession(
  s: WorkoutSession,
): WorkoutReviewRequestPayload["completedSession"] {
  return {
    id: s.id,
    date: s.date,
    title: s.title,
    durationMin: s.durationMin,
    totalVolume: s.totalVolume,
    totalSets: s.totalSets,
    exercises: s.exercises.map((ex) => ({
      name: ex.name,
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
    completedSession: serializeCompletedSession(completed),
    priorSessions,
    exerciseStats,
    logTotals,
  };
}
