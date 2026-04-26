import { enrichProgressionWithStimulus } from "@/lib/exerciseStimulusScore";
import { buildLaggingMuscleAnalysisForPayload } from "@/lib/laggingMuscleAnalysis";
import { buildMuscleVolumeAnalysisForPayload } from "@/lib/muscleVolumeAnalysis";
import { buildPeriodizationForPayload } from "@/lib/periodizationEngine";
import { buildExerciseProgressionForAi } from "@/lib/progressionEngine";
import { serializeAthleteProfileForAi } from "@/lib/serializeAthleteForAi";
import { buildTrainingSignals } from "@/services/trainingSignalEngine";
import { buildProgressionPlan } from "@/services/progressionPlanner";
import { buildTrainingPhaseState } from "@/services/trainingPhaseEngine";
import { buildAdaptiveVolumePlan } from "@/services/adaptiveVolumeEngine";
import { buildSplitSelectionPlan } from "@/services/splitSelectionEngine";
import type {
  AiCoachDataSnapshot,
  AiCoachMode,
  AiDecisionContext,
  ExerciseHistoryItemForAi,
} from "@/types/aiCoach";
import { serializeWorkoutForAi } from "@/services/aiCoachContext";
import { getWorkoutChronologyTime } from "@/lib/workoutChronology";
import {
  inferWorkoutSplitFromTitleAndExercises,
  preferredNextSplits,
  type WorkoutSplitLabel,
} from "@/lib/workoutSplitInference";
import type { WorkoutSession } from "@/types/trainingDiary";
import { EMPTY_LAGGING_MUSCLE_BLOCK } from "@/lib/laggingMuscleAnalysis";
import { EMPTY_MUSCLE_VOLUME_BLOCK } from "@/lib/muscleVolumeAnalysis";
import { EMPTY_PERIODIZATION } from "@/lib/periodizationEngine";

const MAX_RECENT_WORKOUTS = 5;
const MAX_EXERCISE_HISTORY = 24;
const EXERCISE_HISTORY_ROWS = 3;
const SPLIT_GUARD_HOURS = 48;

function hoursSinceWorkoutChronology(session: WorkoutSession, now: Date): number | null {
  const t = getWorkoutChronologyTime(session);
  if (t === 0) return null;
  const ms = now.getTime() - t;
  if (!Number.isFinite(ms)) return null;
  return ms / (1000 * 60 * 60);
}

function slimExerciseHistoryFromProgression(rows: {
  exerciseProgression: AiDecisionContext["progressionRecommendations"]["exerciseProgression"];
}): ExerciseHistoryItemForAi[] {
  const out: ExerciseHistoryItemForAi[] = [];
  for (const p of rows.exerciseProgression.slice(0, MAX_EXERCISE_HISTORY)) {
    const hist = p.history.slice(-EXERCISE_HISTORY_ROWS).map((h) => ({
      date: h.date,
      topWeight: h.topWeight,
      topReps: h.topReps,
      workingSets: h.inRepTargetWorkingSets,
      repDrop: h.inSessionRepDrop,
      inSessionFatigue: h.inSessionFatigue,
    }));
    out.push({
      name: p.name,
      trend: p.trend,
      stagnationSessions: p.stagnationSessions,
      stimulusScore: p.stimulusScore,
      stimulusInterpretation: p.stimulusInterpretation,
      stimulusBelowFiveLastThreeSessions: p.stimulusBelowFiveLastThreeSessions,
      recent: hist,
    });
  }
  return out;
}

/**
 * Unified AI Coach decision pipeline.
 *
 * Notes:
 * - Expects a single `AiCoachDataSnapshot` from one Dexie read (see `buildAiCoachRequestPayload`).
 * - Does not modify workout logging or any Dexie schema.
 * - Keeps derived signals separate from raw-ish history.
 */
export async function buildAiCoachDecisionContext(
  options: { aiMode?: AiCoachMode; snapshot: AiCoachDataSnapshot },
): Promise<AiDecisionContext> {
  const aiMode: AiCoachMode = options.aiMode ?? "history_based";
  const { catalog, settings, athlete, sortedSessions, sessionLevelTrainingSignals } =
    options.snapshot;

  // Newest session first: real workout time (performedAt) when set, else createdAt / date.
  // (Caller builds `snapshot.sortedSessions` with the same sort as this module used previously.)

  // Deleted workouts are not included by `listWorkoutSessions()` (Dexie query only returns persisted rows).
  const recentWorkouts = sortedSessions
    .slice(0, MAX_RECENT_WORKOUTS)
    .map(serializeWorkoutForAi);

  // 1.5) split continuity guard (based on most recent completed session)
  const mostRecent = sortedSessions[0];
  const lastWorkoutSplit: WorkoutSplitLabel = mostRecent
    ? inferWorkoutSplitFromTitleAndExercises(mostRecent)
    : "Unknown";
  const hSince = mostRecent ? hoursSinceWorkoutChronology(mostRecent, new Date()) : null;
  const specializationModeEnabled = false; // future extension: user setting
  const allowSameSplit =
    specializationModeEnabled || (hSince != null && hSince >= SPLIT_GUARD_HOURS);
  const guardActive = lastWorkoutSplit !== "Unknown" && !allowSameSplit;
  const splitContinuityGuard: AiDecisionContext["splitContinuityGuard"] = {
    lastWorkoutSplit,
    hoursSinceLastWorkout: hSince != null ? Math.max(0, Math.round(hSince * 10) / 10) : null,
    allowSameSplit,
    guardActive,
    preferredNextSplits: preferredNextSplits(lastWorkoutSplit),
    reasons: guardActive
      ? [`Last split was ${lastWorkoutSplit}; under ${SPLIT_GUARD_HOURS}h, avoid repeating unless user asks.`]
      : allowSameSplit && lastWorkoutSplit !== "Unknown"
        ? [`48+ hours since last ${lastWorkoutSplit} session; repetition allowed.`]
        : [],
    specializationModeEnabled,
  };

  // Coach mode: keep the experience template-driven and lightweight.
  // Skip heavy analysis engines (muscle volume, lagging muscles, periodization).
  if (aiMode === "coach_recommended") {
    const athleteProfile = serializeAthleteProfileForAi(athlete);
    return {
      recentWorkouts,
      exerciseHistory: [],
      fatigueSignals: {
        recentSplitPattern: [],
        lastWorkedMuscleGroups: [],
        volumeTrend: "unknown",
        fatigueSignal: "unknown",
        exerciseBaselines: [],
      },
      splitContinuityGuard,
      muscleVolume: {
        weeklyMuscleVolume: { ...EMPTY_MUSCLE_VOLUME_BLOCK.weeklyMuscleVolume },
        muscleVolumeTrend: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleVolumeTrend },
        muscleVolumeHistory: [],
        muscleHypertrophyRanges: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleHypertrophyRanges },
      },
      laggingMuscles: { ...EMPTY_LAGGING_MUSCLE_BLOCK },
      progressionRecommendations: { exerciseProgression: [] },
      periodizationState: { ...EMPTY_PERIODIZATION },
      stimulusScores: [],
      athleteProfile,
      aiMode,
      trainingSignals: {
        exerciseTrends: [],
        muscleRecovery: [],
        fatigueTrend: { level: "unknown", reasons: [] },
        progressionFocus: "maintain",
        alerts: [],
      },
      progressionPlan: { globalStrategy: "maintain", exercisePlans: [] },
      trainingPhase: {
        phase: "unknown",
        weekInPhase: 0,
        reason: "",
        fatigueIndicator: "unknown",
        volumeIndicator: "low",
      },
      volumePlan: { muscleVolume: [] },
      splitSelection: undefined,
    };
  }

  // 2) exercise history (via progression engine input), 3) session-level training signals
  // (precomputed in `buildAiCoachRequestPayload`; same object as top-level `trainingSignals`).
  const fatigueSignals = sessionLevelTrainingSignals;

  // 4) muscle volume tracker
  const muscleVolume = buildMuscleVolumeAnalysisForPayload(
    sortedSessions,
    settings.timezone,
    catalog,
  );

  // 2) exercise history backbone (warm-ups stripped inside progression engine)
  const progressionBase = buildExerciseProgressionForAi(sortedSessions);

  // 5) lagging muscles (progression + volume caps + fatigue; stimulus handled separately)
  const laggingMuscles = buildLaggingMuscleAnalysisForPayload(
    sortedSessions,
    settings.timezone,
    catalog,
    progressionBase,
    fatigueSignals.fatigueSignal,
    muscleVolume.weeklyMuscleVolume,
    muscleVolume.muscleHypertrophyRanges,
  );

  // 6) stimulus score (enrichment on top of progression base)
  const exerciseProgression = enrichProgressionWithStimulus(
    progressionBase,
    fatigueSignals.fatigueSignal,
  );

  const stimulusScores = exerciseProgression.map((p) => ({
    name: p.name,
    stimulusScore: p.stimulusScore,
    stimulusInterpretation: p.stimulusInterpretation,
    stimulusBelowFiveLastThreeSessions: p.stimulusBelowFiveLastThreeSessions,
    stimulusComponents: p.stimulusComponents,
  }));

  // 7) periodization (uses fatigue override)
  const periodizationState = buildPeriodizationForPayload(
    sortedSessions,
    fatigueSignals.fatigueSignal,
  );

  // 8) coaching-context signal engine (trends, recovery, alerts — not session summary)
  const coachingContextSignals = buildTrainingSignals({
    workoutSessions: sortedSessions,
    catalog,
    timeZone: settings.timezone,
    exerciseProgression,
    fatigueSignal: fatigueSignals.fatigueSignal,
    volumeTrend: fatigueSignals.volumeTrend,
    weeklyMuscleVolume: muscleVolume.weeklyMuscleVolume,
    muscleHypertrophyRanges: muscleVolume.muscleHypertrophyRanges,
    periodizationPhase: periodizationState.effectivePhase,
    laggingBlockersHighFatigue: laggingMuscles.laggingInterventionBlockers.highFatigue,
  });

  // 9) progression planner (one-variable per exercise strategy)
  const progressionPlan = buildProgressionPlan(coachingContextSignals);

  // 10) training phase engine (build / consolidate / deload)
  const trainingPhase = buildTrainingPhaseState({
    workoutSessions: sortedSessions,
    coachingContextSignals,
    progressionPlan,
  });

  // 11) adaptive volume engine (simple weekly set band plan)
  const volumePlan = buildAdaptiveVolumePlan({
    weeklyMuscleVolume: muscleVolume.weeklyMuscleVolume,
  });

  // 12) split selection engine (choose best among allowed next splits)
  const splitSelection = buildSplitSelectionPlan({
    preferredNextSplits: splitContinuityGuard.preferredNextSplits,
    muscleRecovery: coachingContextSignals.muscleRecovery,
    volumePlan,
    laggingMuscles,
    fatigueSignals,
    trainingPhase,
  });

  // 2) exercise history (slim summary for display/debug)
  const exerciseHistory = slimExerciseHistoryFromProgression({
    exerciseProgression,
  });

  const progressionRecommendations = {
    exerciseProgression,
  };

  const athleteProfile = serializeAthleteProfileForAi(athlete);

  const ctx: AiDecisionContext = {
    recentWorkouts,
    exerciseHistory,
    fatigueSignals,
    splitContinuityGuard,
    muscleVolume: {
      weeklyMuscleVolume: muscleVolume.weeklyMuscleVolume,
      muscleVolumeTrend: muscleVolume.muscleVolumeTrend,
      muscleVolumeHistory: muscleVolume.muscleVolumeHistory,
      muscleHypertrophyRanges: muscleVolume.muscleHypertrophyRanges,
    },
    laggingMuscles,
    progressionRecommendations,
    periodizationState,
    stimulusScores,
    athleteProfile,
    aiMode,
    trainingSignals: coachingContextSignals,
    progressionPlan,
    trainingPhase,
    volumePlan,
    splitSelection,
  };

  if (process.env.NODE_ENV !== "production" && mostRecent) {
    const ct = getWorkoutChronologyTime(mostRecent);
    console.log("[aiCoach] AI last workout / split debug", {
      lastWorkoutTitle: mostRecent.title,
      performedAt: mostRecent.performedAt,
      createdAt: mostRecent.createdAt,
      chronologyTime:
        Number.isFinite(ct) && ct > 0 ? new Date(ct).toISOString() : null,
      lastWorkoutSplit,
      guardActive: splitContinuityGuard.guardActive,
      preferredNextSplits: splitContinuityGuard.preferredNextSplits,
    });
  }

  if (process.env.NODE_ENV !== "production") {
    // Debug helper: keep it concise.
    console.log("[aiCoachDecisionContext] fatigueSignals", ctx.fatigueSignals);
    console.log("[aiCoachDecisionContext] muscleVolume", ctx.muscleVolume);
    console.log("[aiCoachDecisionContext] laggingMuscles", ctx.laggingMuscles);
    console.log("[aiCoachDecisionContext] periodizationState", ctx.periodizationState);
    console.log("[aiCoachDecisionContext] stimulusScores", ctx.stimulusScores.slice(0, 8));
    console.log(
      "[aiCoachDecisionContext] progressionRecommendations",
      ctx.progressionRecommendations.exerciseProgression.slice(0, 8),
    );
    console.log("[aiCoachDecisionContext] splitContinuityGuard", ctx.splitContinuityGuard);
    // Field name `trainingSignals` is historical; value is coaching-engine output, not session summary.
    console.log("[aiCoachDecisionContext] trainingSignals (coaching engine)", {
      fatigueTrend: ctx.trainingSignals.fatigueTrend,
      progressionFocus: ctx.trainingSignals.progressionFocus,
      alerts: ctx.trainingSignals.alerts,
      exerciseTrends: ctx.trainingSignals.exerciseTrends.slice(0, 4),
      muscleRecovery: ctx.trainingSignals.muscleRecovery.slice(0, 4),
    });
    console.log("[aiCoachDecisionContext] progressionPlan", ctx.progressionPlan);
    console.log("[aiCoachDecisionContext] trainingPhase", ctx.trainingPhase);
    console.log("[aiCoachDecisionContext] volumePlan", ctx.volumePlan);
  }

  // 9) final AI payload is built in `buildAiCoachRequestPayload` from this context.
  return ctx;
}

