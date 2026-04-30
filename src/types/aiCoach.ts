import type { AppLanguage } from "@/i18n/language";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import type { CoachMemoryContext } from "@/services/aiCoachMemory";
import type { AthleteProfile } from "./athleteProfile";
import type { UserSettings } from "./index";
import type { Exercise, WorkoutSession } from "./trainingDiary";

export type SuggestedSet = { weight: number; reps: number };

export type VolumeTrend = "up" | "down" | "stable" | "unknown";
export type FatigueSignal = "high" | "moderate" | "low" | "unknown";

export type ExerciseBaselineForAi = {
  name: string;
  latestSets: { weight: number; reps: number; volume: number }[];
  bestSet: { weight: number; reps: number; volume: number } | null;
  lastSessionVolume: number;
};

/**
 * **Session-level summary** (from `computeTrainingSignals` in `services/trainingSignals.ts`):
 * recent title pattern, `lastWorkedMuscleGroups`, session volume trend, session-level `fatigueSignal`
 * (from last workout’s set count heuristics), and per-exercise baselines. This is the lighter layer.
 *
 * On the API wire: `AiCoachRequestPayload["trainingSignals"]` and, in `history_based` mode,
 * `AiDecisionContext.fatigueSignals` (same object as the payload’s `trainingSignals` for that build).
 */
export type TrainingSignals = {
  recentSplitPattern: string[];
  lastWorkedMuscleGroups: string[];
  volumeTrend: VolumeTrend;
  fatigueSignal: FatigueSignal;
  exerciseBaselines: ExerciseBaselineForAi[];
};

/** Same struct as `TrainingSignals` — use this name at call sites to mean “session summary”, not the engine. */
export type SessionSummarySignals = TrainingSignals;

/**
 * One Dexie read of coach inputs for a single suggest-next build.
 * `sortedSessions` uses the same chronology order as the AI decision pipeline
 * (newest first: performedAt, else createdAt / date).
 * `sessionLevelTrainingSignals` is the single `computeTrainingSignals(sortedSessions, catalog)` result
 * (payload `trainingSignals` and, in history_based mode, `aiDecisionContext.fatigueSignals`).
 */
export type AiCoachDataSnapshot = {
  sessions: WorkoutSession[];
  sortedSessions: WorkoutSession[];
  catalog: Exercise[];
  settings: UserSettings;
  athlete: AthleteProfile;
  sessionLevelTrainingSignals: SessionSummarySignals;
};

export type ExerciseDecision =
  | "increase"
  | "maintain"
  | "reduce"
  | "technique"
  | "volume";

export type AiTrainingSignalsResponse = {
  split: string;
  fatigue: FatigueSignal;
  volume_trend: VolumeTrend;
  strategy: string;
};

export type AiInsightType =
  | "progress"
  | "fatigue"
  | "balance"
  | "risk"
  | "opportunity";

export type AiInsight = {
  type: AiInsightType;
  title: string;
  text: string;
};

export type SuggestNextWorkoutAiExercise = {
  name: string;
  sets: SuggestedSet[];
  /** Short coaching note; never empty after server normalize. */
  reason: string;
  decision: ExerciseDecision;
  /** Short English label from the model (or defaults); UI may localize via `decision`. */
  decision_label: string;
};

export type SuggestNextWorkoutAiDebug = {
  mode?: "history" | "coach";
  generationSource?: "adaptive_history" | "coach_skeleton";
  /** Set when insight pipeline runs (typically development builds). */
  insightSource?: "llm" | "fallback";
  /** Validation / quality notes for the insight step. */
  insightWarnings?: string[];
  /** Development-only: engine decision trace for this generation. */
  decisionTrace?: {
    traceId: string;
    entries: import("@/types/decisionTrace").DecisionTraceEntry[];
  };
  lastWorkoutTitle?: string;
  performedAt?: string;
  createdAt?: string;
  lastWorkoutSplit?: string;
  guardActive?: boolean;
  preferredNextSplits?: string[];
  splitSelection?: {
    recommendedSplit: string;
    candidates: { split: string; score: number }[];
    reason: string;
  };
  /** Whether onboarding strength calibration was used to seed any baseline loads. */
  strengthCalibrationUsed?: boolean;
  /** List of exercises whose baseline loads were seeded from calibration. */
  calibratedExercises?: Array<{
    exercise: string;
    sourceLift: string;
    estimatedWeight: number;
  }>;
  /** Debug payload visibility for calibration. */
  strengthCalibrationDebug?: {
    payloadHasStrengthCalibration: boolean;
    decisionContextHasStrengthCalibration: boolean;
  };
  /** Per-exercise load source tracing (development only). */
  exerciseLoadDebug?: Array<{
    exercise: string;
    programmedLoad: number | null;
    /** True when a calibration-derived estimate exists for this exercise name. */
    calibrationMatch: boolean;
    /** Final per-exercise calibration estimate used for load logic (if any). */
    calibrationWeight: number | null;
    finalWeight: number;
    source: "calibration" | "calibration_rpe" | "llm" | "history" | "fallback";
    /** Payload includes at least one valid onboarding strength calibration entry. */
    calibrationAvailable?: boolean;
    /** Estimated load from calibration mapping for this exercise; mirrors calibrationWeight when set. */
    calibrationEstimate?: number;
    /** True when `source` is `calibration` (numeric load from calibration). */
    calibrationMatched?: boolean;
  }>;

  coachModeProfileApplied?: boolean;
  coachModeSource?: "profile_starter";
  coachModeReason?: string;
  /** Post-generation progression safety notes (e.g. capped load / sets). */
  progressionGuards?: string[];
};

export type SuggestNextWorkoutResponse = {
  title: string;
  /**
   * One of: Normal progression, Volume focus, Intensity focus,
   * Recovery session, Technique session.
   */
  session_type: string;
  /** 0–100 from model + server blend after finalize. */
  confidence: number;
  reason: string;
  training_signals: AiTrainingSignalsResponse;
  /** At most 3 non-empty insight cards after finalize. */
  insights: AiInsight[];
  exercises: SuggestNextWorkoutAiExercise[];
  warnings: string[];
  recoverySummary?: Array<{
    muscle: string;
    status: "ready" | "recovering" | "fatigued" | "unknown";
    score?: number;
  }>;
  volumeSummary?: Array<{
    muscle: string;
    status: "low" | "optimal" | "high" | "unknown";
    sets?: number;
  }>;
  /** Set in development: last-workout + split-guard context for this request. */
  aiDebug?: SuggestNextWorkoutAiDebug;
};

export type SerializableWorkoutForAi = {
  id: string;
  date: string;
  title: string;
  createdAt: string;
  /** When the session was done (if known); used for chronology / debugging. */
  performedAt?: string;
  durationMin?: number;
  totalSets: number;
  totalVolume: number;
  exercises: {
    name: string;
    exerciseId?: string;
    /** Set when the exercise resolved to a catalog row. */
    primaryMuscle?: PrimaryMuscleGroup;
    /** True when the exercise could not be resolved (no regex fallback). */
    unknownExercise?: boolean;
    sets: { weight: number; reps: number; volume: number }[];
  }[];
};

export type ExerciseHistoryItemForAi = {
  name: string;
  trend: ExerciseProgressionTrend;
  stagnationSessions: number;
  stimulusScore: number;
  stimulusInterpretation: StimulusInterpretation;
  stimulusBelowFiveLastThreeSessions: boolean;
  recent: {
    date: string;
    topWeight: number;
    topReps: number;
    workingSets: number;
    repDrop: number;
    inSessionFatigue: boolean;
  }[];
};

export type AiDecisionContext = {
  recentWorkouts: SerializableWorkoutForAi[];
  exerciseHistory: ExerciseHistoryItemForAi[];
  /** Session summary (`SessionSummarySignals` / `computeTrainingSignals`); mirrors payload `trainingSignals` in `history_based`. */
  fatigueSignals: TrainingSignals;
  splitContinuityGuard: {
    lastWorkoutSplit: "Push" | "Pull" | "Legs" | "Full" | "Unknown";
    hoursSinceLastWorkout: number | null;
    /** If false, avoid repeating last split unless user explicitly asks. */
    allowSameSplit: boolean;
    /** True when last split is known and repetition is discouraged. */
    guardActive: boolean;
    preferredNextSplits: ("Push" | "Pull" | "Legs" | "Full")[];
    reasons: string[];
    specializationModeEnabled: boolean;
  };
  muscleVolume: {
    weeklyMuscleVolume: Record<PrimaryMuscleGroup, number>;
    muscleVolumeTrend: Record<PrimaryMuscleGroup, VolumeTrend>;
    muscleVolumeHistory?: MuscleVolumeHistoryEntry[];
    muscleHypertrophyRanges: Partial<
      Record<PrimaryMuscleGroup, { min: number; max: number }>
    >;
  };
  laggingMuscles: {
    muscleProgressScore: Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend>;
    laggingMuscleGroups: PrimaryMuscleGroup[];
    stagnatingExercises: StagnationExerciseForAi[];
    laggingInterventionBlockers: LaggingInterventionBlockers;
    muscleProgressHistory: MuscleProgressHistoryEntry[];
  };
  progressionRecommendations: {
    exerciseProgression: ExerciseProgressionForAi[];
  };
  periodizationState: PeriodizationForAi;
  stimulusScores: {
    name: string;
    stimulusScore: number;
    stimulusInterpretation: StimulusInterpretation;
    stimulusBelowFiveLastThreeSessions: boolean;
    stimulusComponents: StimulusComponents;
  }[];
  athleteProfile: Record<string, unknown>;
  aiMode: AiCoachMode;
  /** Coaching engine (`CoachingContextSignals` / `buildTrainingSignals`); not the session summary. */
  trainingSignals: TrainingSignalEngineOutput;
  progressionPlan: ProgressionPlan;
  trainingPhase: TrainingPhaseStateForAi;
  volumePlan: AdaptiveVolumePlanForAi;
  splitSelection?: SplitSelectionPlanForAi;
};

export type SplitSelectionCandidateForAi = {
  split: "Push" | "Pull" | "Legs" | "Full";
  score: number;
  reasons: string[];
};

export type SplitSelectionPlanForAi = {
  recommendedSplit: "Push" | "Pull" | "Legs" | "Full" | "Unknown";
  candidates: SplitSelectionCandidateForAi[];
  reason: string;
};

export type TrainingSignalExerciseTrend = {
  exerciseName: string;
  trend: ExerciseProgressionTrend;
  lastBestSet: string;
  previousBestSet?: string;
  note: string;
};

export type TrainingSignalFatigueTrend = {
  level: FatigueSignal;
  reasons: string[];
};

export type TrainingSignalMuscleRecovery = {
  muscleGroup: PrimaryMuscleGroup;
  recoveryScore: number;
  status: "ready" | "moderate" | "fatigued" | "unknown";
  lastTrainedAt?: string;
  weeklySets: number;
  note: string;
};

/**
 * **Coaching-context engine** output (from `buildTrainingSignals` in `services/trainingSignalEngine.ts`):
 * per-exercise trend lines, per-muscle recovery rows, derived `fatigueTrend`, `progressionFocus`, and `alerts`.
 * Feeds progression planner, phase, and split selection. Not the same as `TrainingSignals` / session summary.
 *
 * On the API wire: `AiDecisionContext["trainingSignals"]` only (field name is historical; value is this shape).
 */
export type TrainingSignalEngineOutput = {
  exerciseTrends: TrainingSignalExerciseTrend[];
  muscleRecovery: TrainingSignalMuscleRecovery[];
  fatigueTrend: TrainingSignalFatigueTrend;
  progressionFocus: "progress" | "maintain" | "reduce" | "deload" | "technique";
  alerts: string[];
};

/** Same struct as `TrainingSignalEngineOutput` — clarifies “engine layer” at call sites. */
export type CoachingContextSignals = TrainingSignalEngineOutput;

export type ProgressionPlanExercise = {
  exerciseName: string;
  action:
    | "increase_reps"
    | "increase_weight"
    | "increase_sets"
    | "maintain"
    | "reduce_sets"
    | "reduce_weight"
    | "swap_exercise";
  reason: string;
  target?: string;
};

export type ProgressionPlan = {
  globalStrategy: "progress" | "maintain" | "reduce" | "deload" | "technique";
  exercisePlans: ProgressionPlanExercise[];
};

export type TrainingPhaseStateForAi = {
  phase: "build" | "consolidate" | "deload" | "unknown";
  weekInPhase: number;
  reason: string;
  fatigueIndicator: "low" | "moderate" | "high" | "unknown";
  volumeIndicator: "low" | "moderate" | "high";
};

export type AdaptiveVolumePlanMuscleRow = {
  muscleGroup: string;
  weeklySets: number;
  recommendedRange: [number, number];
  status: "low" | "optimal" | "high";
  action: "increase" | "maintain" | "reduce";
};

export type AdaptiveVolumePlanForAi = {
  muscleVolume: AdaptiveVolumePlanMuscleRow[];
};

export type AiCoachExerciseStat = {
  name: string;
  sessionsInHistory: number;
  bestSet?: { weight: number; reps: number; volume: number };
  lastPerformedDate?: string;
};

/**
 * Letter grade for a finished session. Model must align with `score` (see AI prompt).
 */
export type WorkoutReviewGrade = "A+" | "A" | "B+" | "B" | "C" | "D";

/** Response from POST /api/ai-coach/review-workout; also stored on WorkoutSession.aiReview. */
export type WorkoutAiReview = {
  /**
   * Session quality 0–100. Omitted in older stored reviews.
   * Bands: 90+ excellent, 80–89 strong, 70–79 good/needs attention, 60–69 mixed, under 60 poor/recovery.
   */
  score?: number;
  grade?: WorkoutReviewGrade;
  /** Short headline; language matches UI. */
  verdict?: string;
  /** Longer 2–3 sentence recap; when `verdict` is set, UI may show verdict only. */
  summary: string;
  went_well: string[];
  needs_attention: string[];
  next_time: string[];
  exercise_notes: { name: string; note: string }[];
  /** Optional structured insights; if absent, UI may derive cards from `went_well`. */
  insights?: AiInsight[];
  /** Optional extra warnings; if absent, UI uses `needs_attention`. */
  warnings?: string[];
};

/**
 * Input for the review API: the session just completed, older sessions, and stats.
 * Payload is built client-side from Dexie and sent to the server.
 */
export type WorkoutReviewRequestPayload = {
  /** UI language: all coach copy (summary, bullets, note text) must match. `"en"` or `"ru"`. */
  language?: AppLanguage;
  /** Explicit UI locale override from the client (preferred over `language` when present). */
  locale?: AppLanguage;
  /**
   * Primary intent for how the coach should evaluate the session.
   * This is a simplified, review-only goal (distinct from the onboarding profile goal enum).
   */
  workoutGoal?: "hypertrophy" | "strength" | "fat_loss" | "general_fitness";
  /** Deterministic progression targets computed from the completed session + log (pre-LLM). */
  autoProgressionTargets?: Array<{
    exerciseName: string;
    action: "increase_reps" | "increase_weight" | "maintain" | "reduce_weight" | "reduce_sets";
    lastPerformance: string;
    nextTarget: string;
    reason: string;
  }>;
  /** Same shape as suggest-next; only defined fields. */
  athleteProfile: Record<string, unknown>;
  completedSession: {
    id: string;
    date: string;
    title: string;
    /** Intent / session type inferred from the workout itself. */
    workoutMode?: "single_muscle" | "split" | "full_body" | "custom";
    /** Best-effort target muscles (e.g. ["biceps"]). */
    targetMuscles?: string[];
    durationMin?: number;
    totalVolume: number;
    totalSets: number;
    exercises: {
      name: string;
      muscleGroup?: string;
      equipment?: string;
      sets: {
        weight: number;
        reps: number;
        volume: number;
        isDone?: boolean;
        completedAt?: string;
      }[];
    }[];
  };
  /** 3–5 prior sessions, newest of those first (immediately after completed in the log). */
  priorSessions: SerializableWorkoutForAi[];
  exerciseStats: AiCoachExerciseStat[];
  logTotals: { totalVolume: number; totalSetCount: number };
};

/** 7-day bucket in user timezone (for `muscleVolumeHistory`, future charts). */
export type MuscleVolumeHistoryEntry = {
  periodStart: string;
  periodEnd: string;
  setsByMuscle: Record<PrimaryMuscleGroup, number>;
};

/** Default + optional user overrides from Settings; no implicit post-cycle context. */
export type AiTrainingContextPayload = {
  trainingPhase: string;
  goal: string;
  progressionMode: "progressive overload";
  userNotesFromSettings?: string;
  offCycleDate?: string;
};

/** Next-workout AI style: follow log closely vs. balanced coach programming. */
export type AiCoachMode = "history_based" | "coach_recommended";

/** Heuristic from history (3–5 sessions) for one exercise. */
export type ExerciseProgressionTrend =
  | "improving"
  | "stable"
  | "stagnating"
  | "declining"
  | "unknown";

/**
 * Rolled up from per-exercise `exerciseProgression` (same 3× flat top = stagnating rules as engine).
 */
export type MuscleGroupAggregateTrend =
  | "improving"
  | "stable"
  | "stagnating"
  | "declining"
  | "mixed"
  | "unknown";

/**
 * One snapshot for `muscleProgressHistory` (future time series / UI).
 */
export type MuscleProgressHistoryEntry = {
  asOf: string;
  muscleProgressScore: Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend>;
  laggingMuscleGroups: PrimaryMuscleGroup[];
};

export type StagnationExerciseForAi = {
  name: string;
  primaryMuscle: PrimaryMuscleGroup;
  trend: ExerciseProgressionTrend;
  stagnationSessions: number;
  topWeight: number;
  topReps: number;
};

export type LaggingInterventionBlockers = {
  highFatigue: boolean;
  musclesAtWeeklyVolumeMax: PrimaryMuscleGroup[];
};

/** Future: user setting; not stored in Dexie yet. */
export type TrainingCycleTypePreference = "strength" | "hypertrophy" | "mixed";

/**
 * 4×4 session-based microcycle: every 4 completed sessions advances one “training week”;
 * after 16 sessions the pattern repeats. `effectivePhase` may be **deload** early if `forcedDeload`.
 */
export type PeriodizationForAi = {
  trainingCycleWeek: 1 | 2 | 3 | 4;
  /** 0–15 within the 16-workout macrocycle (for the next planned session). */
  workoutIndexInCycle: number;
  /** 0–3 within the current 4-workout “training week”. */
  workoutPositionInTrainingWeek: 0 | 1 | 2 | 3;
  totalSessionsLogged: number;
  scheduledPhase: "moderate" | "progression" | "peak" | "deload";
  effectivePhase: "moderate" | "progression" | "peak" | "deload";
  forcedDeload: boolean;
  /** Target working-set count vs typical; about 0.65 in deload. */
  deloadSetVolumeMultiplierTarget: number;
  cycleTypePreference: TrainingCycleTypePreference;
};

export type StimulusInterpretation =
  | "strong"
  | "acceptable"
  | "weak"
  | "poor"
  | "unknown";

export type StimulusComponents = {
  progressScore: number;
  repConsistency: number;
  volumeScore: number;
  fatiguePenalty: number;
  /** progress + repConsistency + volumeScore + fatiguePenalty (pre-clamp). */
  rawSum: number;
};

/** Progression engine output before stimulus merge. */
export type ExerciseProgressionForAiBase = {
  name: string;
  repTargetRange: { min: number; max: number };
  history: {
    date: string;
    sessionId: string;
    topWeight: number;
    topReps: number;
    workingVolume: number;
    inRepTargetWorkingSets: number;
    inSessionRepDrop: number;
    inSessionFatigue: boolean;
  }[];
  trend: ExerciseProgressionTrend;
  stagnationSessions: number;
  fatigueDetected: boolean;
  volumeFalling3Sessions: boolean;
  hint: string;
};

/**
 * One exercise row from the progression engine + stimulus (oldest `history` first).
 * Stimulus is merged in `enrichProgressionWithStimulus`. Not stored in Dexie.
 */
export type ExerciseProgressionForAi = ExerciseProgressionForAiBase & {
  /** 0–10; from last 3–5 sessions. */
  stimulusScore: number;
  stimulusComponents: StimulusComponents;
  stimulusInterpretation: StimulusInterpretation;
  /** All three of the last 3 per-session 0–10 sub-scores were under 5. */
  stimulusBelowFiveLastThreeSessions: boolean;
};

export type AiCoachRequestPayload = {
  /** UI language: model must answer user-facing strings in this language. */
  language: AppLanguage;
  /** How the model balances fidelity to the log vs. program design. */
  aiMode: AiCoachMode;
  /** Onboarding / profile fields (only set keys are sent). */
  athleteProfile: Record<string, unknown>;
  /** Newest first, at most 5 */
  recentSessions: SerializableWorkoutForAi[];
  /** All logged sessions (lifetime totals) */
  logTotals: { totalVolume: number; totalSetCount: number };
  /** Most recently used exercise names, newest-first, deduplicated */
  mostRecentExercises: string[];
  exerciseStats: AiCoachExerciseStat[];
  favorites: { name: string; muscleGroup?: string; equipment?: string }[];
  /**
   * Canonical Dexie exercise catalog snapshot (enriched) used as the deterministic
   * candidate pool for suggest-next structure selection.
   */
  exerciseCatalog: Exercise[];
  settings: {
    defaultRestSec?: number;
    planningStyle?: string;
    preferredActionTypes?: string[];
    timezone: string;
  };
  trainingContext: AiTrainingContextPayload;
  /** Session summary (`SessionSummarySignals` / `computeTrainingSignals`); not `aiDecisionContext.trainingSignals`. */
  trainingSignals: TrainingSignals;
  /** Per-exercise progression (warm-ups stripped, rep-target band, trend). */
  exerciseProgression: ExerciseProgressionForAi[];
  /**
   * Rolling 7-day working-set counts per primary muscle (user timezone).
   * Used with `muscleHypertrophyRanges` and `muscleVolumeTrend` to adjust set counts.
   */
  weeklyMuscleVolume: Record<PrimaryMuscleGroup, number>;
  /** vs the prior 7-day window. */
  muscleVolumeTrend: Record<PrimaryMuscleGroup, VolumeTrend>;
  /** Four non-overlapping 7-day buckets, oldest first (for future charts). */
  muscleVolumeHistory: MuscleVolumeHistoryEntry[];
  /** Hypertrophy set/week bands; if weekly at or above `max`, do not add working sets for that muscle. */
  muscleHypertrophyRanges: Partial<
    Record<PrimaryMuscleGroup, { min: number; max: number }>
  >;
  /**
   * Rolled from `exerciseProgression` + catalog muscle mapping. Computed after volume, before the model.
   */
  muscleProgressScore: Record<PrimaryMuscleGroup, MuscleGroupAggregateTrend>;
  /** Subset of muscles to prioritize (stagnation/decline vs others). */
  laggingMuscleGroups: PrimaryMuscleGroup[];
  stagnatingExercises: StagnationExerciseForAi[];
  laggingInterventionBlockers: LaggingInterventionBlockers;
  /** Point-in-time snapshot(s) for future analytics / charts. */
  muscleProgressHistory: MuscleProgressHistoryEntry[];
  /** 4-week session-based intensity block; after lagging, before model. */
  periodization: PeriodizationForAi;
  /** Unified analysis pipeline summary (primary source of truth for the model). */
  aiDecisionContext: AiDecisionContext;
  quickTemplates: { id: string; label: string; muscleLine: string; exercises: string[] }[];

  /** Optional: durable per-exercise coach memory context (built client-side from Dexie). */
  coachMemory?: CoachMemoryContext;

  /**
   * Optional UI-driven override: user requested a custom workout target.
   * Server may use this to bias exercise selection and title, while still respecting recovery/volume guards.
   */
  customWorkoutRequest?: {
    targetMuscles: string[];
    durationMin: number;
    focus: "hypertrophy" | "strength" | "pump" | "light";
  };
};
