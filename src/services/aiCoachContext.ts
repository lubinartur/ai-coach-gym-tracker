import { getOrCreateAthleteProfile } from "@/db/athleteProfile";
import { listExercises } from "@/db/exercises";
import { getOrCreateSettings } from "@/db/settings";
import { parseAppLanguage } from "@/i18n/language";
import { listWorkoutSessions } from "@/db/workoutSessions";
import { serializeAthleteProfileForAi } from "@/lib/serializeAthleteForAi";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { QUICK_WORKOUT_TEMPLATES } from "@/lib/workoutQuickTemplates";
import {
  buildAiTrainingContext,
  computeTrainingSignals,
} from "@/services/trainingSignals";
import { buildAiCoachDecisionContext } from "@/services/aiCoachDecisionPipeline";
import type {
  AiCoachExerciseStat,
  AiCoachMode,
  AiCoachRequestPayload,
  SerializableWorkoutForAi,
} from "@/types/aiCoach";
import type { WorkoutSession } from "@/types/trainingDiary";

const MAX_SESSIONS = 5;
const MAX_STAT_NAMES = 24;
const MAX_RECENT_NAMES = 20;

export function serializeWorkoutForAi(
  s: WorkoutSession,
): SerializableWorkoutForAi {
  return {
    id: s.id,
    date: s.date,
    title: s.title,
    createdAt: s.createdAt,
    performedAt: s.performedAt,
    durationMin: s.durationMin,
    totalSets: s.totalSets,
    totalVolume: s.totalVolume,
    exercises: s.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets.map((st) => ({
        weight: st.weight,
        reps: st.reps,
        volume: st.volume,
      })),
    })),
  };
}

type Agg = {
  name: string;
  sessionIds: Set<string>;
  bestVolume: number;
  bestWeight: number;
  bestReps: number;
  lastDate?: string;
};

export function buildExerciseStats(
  sessions: WorkoutSession[],
  favoriteNameKeys: Set<string>,
): AiCoachExerciseStat[] {
  const map = new Map<string, Agg>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const key = normalizeExerciseName(ex.name);
      if (!key) continue;
      let a = map.get(key);
      if (!a) {
        a = {
          name: ex.name.trim() || ex.name,
          sessionIds: new Set(),
          bestVolume: 0,
          bestWeight: 0,
          bestReps: 0,
        };
        map.set(key, a);
      } else if (!a.name && ex.name.trim()) {
        a.name = ex.name.trim();
      }
      a.sessionIds.add(s.id);
      a.lastDate = a.lastDate ?? s.date;
      for (const st of ex.sets) {
        const w = Math.max(0, st.weight);
        const r = Math.max(0, st.reps);
        const v = st.volume ?? w * r;
        if (v > a.bestVolume) {
          a.bestVolume = v;
          a.bestWeight = w;
          a.bestReps = r;
        }
      }
    }
  }

  return [...map.values()]
    .map((a) => ({
      name: a.name,
      sessionsInHistory: a.sessionIds.size,
      bestSet:
        a.bestVolume > 0
          ? { weight: a.bestWeight, reps: a.bestReps, volume: a.bestVolume }
          : undefined,
      lastPerformedDate: a.lastDate,
    }))
    .sort((x, y) => {
      const kx = normalizeExerciseName(x.name);
      const ky = normalizeExerciseName(y.name);
      const fx = favoriteNameKeys.has(kx) ? 1 : 0;
      const fy = favoriteNameKeys.has(ky) ? 1 : 0;
      if (fy !== fx) return fy - fx;
      if (y.sessionsInHistory !== x.sessionsInHistory) {
        return y.sessionsInHistory - x.sessionsInHistory;
      }
      return x.name.localeCompare(y.name);
    })
    .slice(0, MAX_STAT_NAMES);
}

/** Newest sessions first: unique exercise display names in order of first appearance. */
function buildMostRecentExercises(sessions: WorkoutSession[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const raw = ex.name?.trim();
      if (!raw) continue;
      const k = normalizeExerciseName(raw);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(raw);
      if (out.length >= MAX_RECENT_NAMES) return out;
    }
  }
  return out;
}

export type BuildAiCoachRequestOptions = {
  /** Default: history_based */
  aiMode?: AiCoachMode;
};

/**
 * Compact payload for POST /api/ai-coach/suggest-next-workout
 * (last 5 sessions, lifetime totals, recent exercise names, stats, favorites, context).
 */
export async function buildAiCoachRequestPayload(
  options: BuildAiCoachRequestOptions = {},
): Promise<AiCoachRequestPayload> {
  const aiMode: AiCoachMode = options.aiMode ?? "history_based";
  const [rows, catalog, settings, athlete] = await Promise.all([
    listWorkoutSessions(),
    listExercises(),
    getOrCreateSettings(),
    getOrCreateAthleteProfile(),
  ]);

  const recentSessions = rows
    .slice(0, MAX_SESSIONS)
    .map(serializeWorkoutForAi);

  const logTotals = rows.reduce(
    (acc, s) => {
      acc.totalVolume += s.totalVolume;
      acc.totalSetCount += s.totalSets;
      return acc;
    },
    { totalVolume: 0, totalSetCount: 0 },
  );

  const sessionSlice = rows.slice(0, MAX_SESSIONS);
  const favKeys = new Set(
    catalog
      .filter((e) => e.isFavorite)
      .map((e) => normalizeExerciseName(e.name))
      .filter(Boolean),
  );
  const exerciseStats = buildExerciseStats(sessionSlice, favKeys);
  const mostRecentExercises = buildMostRecentExercises(sessionSlice);

  const favorites = catalog
    .filter((e) => e.isFavorite)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      name: e.name,
      muscleGroup: e.muscleGroup,
      equipment: e.equipment,
    }));

  const quickTemplates = QUICK_WORKOUT_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    muscleLine: t.muscleLine,
    exercises: [...t.exercises],
  }));

  const trainingContext = buildAiTrainingContext(athlete);
  const trainingSignals = computeTrainingSignals(rows, catalog);

  const aiDecisionContext = await buildAiCoachDecisionContext({ aiMode });

  return {
    language: parseAppLanguage(settings.language),
    aiMode,
    athleteProfile: serializeAthleteProfileForAi(athlete),
    recentSessions,
    logTotals,
    mostRecentExercises,
    exerciseStats,
    favorites,
    settings: {
      defaultRestSec: settings.defaultRestSec,
      planningStyle: settings.planningStyle,
      preferredActionTypes: settings.preferredActionTypes,
      timezone: settings.timezone,
    },
    trainingContext,
    trainingSignals,
    exerciseProgression: aiDecisionContext.progressionRecommendations.exerciseProgression,
    weeklyMuscleVolume: aiDecisionContext.muscleVolume.weeklyMuscleVolume,
    muscleVolumeTrend: aiDecisionContext.muscleVolume.muscleVolumeTrend,
    muscleVolumeHistory: aiDecisionContext.muscleVolume.muscleVolumeHistory ?? [],
    muscleHypertrophyRanges: aiDecisionContext.muscleVolume.muscleHypertrophyRanges,
    muscleProgressScore: aiDecisionContext.laggingMuscles.muscleProgressScore,
    laggingMuscleGroups: aiDecisionContext.laggingMuscles.laggingMuscleGroups,
    stagnatingExercises: aiDecisionContext.laggingMuscles.stagnatingExercises,
    laggingInterventionBlockers: aiDecisionContext.laggingMuscles.laggingInterventionBlockers,
    muscleProgressHistory: aiDecisionContext.laggingMuscles.muscleProgressHistory,
    periodization: aiDecisionContext.periodizationState,
    aiDecisionContext,
    quickTemplates,
  };
}