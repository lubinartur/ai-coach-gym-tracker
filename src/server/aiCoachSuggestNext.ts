import type {
  AiCoachRequestPayload,
  AiInsight,
  AiTrainingSignalsResponse,
  ExerciseDecision,
  FatigueSignal,
  SuggestNextWorkoutResponse,
  VolumeTrend,
} from "@/types/aiCoach";
import { stripJsonFence } from "@/server/openaiPlanJson";
import { QUICK_WORKOUT_TEMPLATES } from "@/lib/workoutQuickTemplates";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { buildDisplayTrainingSignals } from "@/lib/aiTrainingSignalsFormat";
import { inferDecisionFromReason } from "@/lib/aiCoachDecisionInfer";
import { parseAppLanguage } from "@/i18n/language";
import { EMPTY_LAGGING_MUSCLE_BLOCK } from "@/lib/laggingMuscleAnalysis";
import type { PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { EMPTY_MUSCLE_VOLUME_BLOCK } from "@/lib/muscleVolumeAnalysis";
import { DEFAULT_STIMULUS } from "@/lib/exerciseStimulusScore";
import { EMPTY_PERIODIZATION } from "@/lib/periodizationEngine";
import {
  inferWorkoutSplitFromTitleAndExercises,
  splitRepetitionViolatesGuard,
} from "@/lib/workoutSplitInference";
import type { ExerciseProgressionForAi } from "@/types/aiCoach";

const MODEL = "gpt-4.1-mini";

const SESSION_TYPES = [
  "Normal progression",
  "Volume focus",
  "Intensity focus",
  "Recovery session",
  "Technique session",
] as const;

const DECISIONS: ExerciseDecision[] = [
  "increase",
  "maintain",
  "reduce",
  "technique",
  "volume",
];

const INSIGHT_TYPES: AiInsight["type"][] = [
  "progress",
  "fatigue",
  "balance",
  "risk",
  "opportunity",
];

const FATIGUE_SET: FatigueSignal[] = ["low", "moderate", "high", "unknown"];
const VOLUME_SET: VolumeTrend[] = ["up", "down", "stable", "unknown"];

const DEFAULT_DECISION_LABEL: Record<ExerciseDecision, string> = {
  increase: "+2.5kg progression",
  maintain: "Maintain weight",
  reduce: "Reduce load",
  technique: "Technique focus",
  volume: "Volume focus",
};

const MAX_LINE = 120;
const MAX_EXERCISE_REASON = 150;
const MAX_INSIGHTS = 3;

const ADAPTIVE_VOLUME_RULES = `## Adaptive volume (set counts per exercise)
You choose how many **working sets** per exercise (length of the "sets" array). This is not medical advice; it is load management from training data and profile.

**Classify** each exercise as one of: compound (multi-joint primary patterns: squat, hinge, bench, row, OHP, etc.), accessory (secondary compound or machine compounds), isolation (single-joint), core/calves (ab work, calf raises, etc.).

**Base set ranges (working sets, before fatigue adjustments):**
- Compounds: 3–5 sets
- Accessory: 2–4 sets
- Isolation: 2–4 sets
- Core/calves: 2–4 sets

**Adjust using** \`athleteProfile\` and \`trainingContext\` / \`trainingSignals\` / per-exercise stats in the payload:
- **goal = strength** (from profile): favor compounds; keep accessories on the lower end of their range.
- **goal = build_muscle** / **build muscle**: moderate to higher volume where fatigue allows.
- **goal = lose_fat**: moderate volume; avoid excessive strain on big lifts (no reckless volume).
- **experience = beginner**: reduce total sets across the session (stay low in each range).
- **experience = advanced**: you may use the upper end of ranges when signals support it.
- **trainingSignals.fatigueSignal = high**: reduce working sets by **1** for each exercise (do not go below 2 working sets for main work unless the session is explicitly recovery-oriented).
- **volume_trend = up** (from model output + log): do **not** add total sets vs a recent comparable session; hold or shift volume, do not stack more sets.
- **volume_trend = down** and fatigue is **low** or **moderate**: a **small** increase in sets is allowed where justified.
- **trainingSignals.lastWorkedMuscleGroups**: if the target muscle for an exercise was trained very recently, reduce direct volume for that pattern (fewer sets or a lighter choice).
- **exercise baselines / history**: if last performance **dropped** (worse reps/loads), keep or **reduce** sets; if the lifter **progressed cleanly**, you may keep sets or add **at most +1** set when volume/fatigue trend supports it (no big jumps).

**athleteProfile.recoveryCapacity** (always present: "normal" or "high"):
- **normal**: default, conservative when in doubt.
- **high**: you may allow **slightly** higher training volume when other signals (fatigue, trend) allow it—still **no aggressive jumps**, still respect fatigue and recent muscle overlap. This setting is for programming tolerance only, not a medical claim.

**Per-exercise "reason" must include a short volume note** (same field as load rationale), e.g. "4 sets because fatigue is moderate and volume trend is down." or "3 sets; muscle group trained recently, keeping direct volume lower." Keep under the character limit.`;

const SINGLE_VARIABLE_PROGRESSION_RULES = `## Single-variable progression (per exercise)
For each exercise, you may adjust **weight**, **reps** (target for working sets), **set count** (length of "sets" array), or **exercise selection**—but apply **only one lever** of progressions per exercise in this session. Do **not** add weight and add a set in the same movement; do not bump reps and swap the exercise in one go. If multiple things need fixing, pick the **single** highest-priority change below.

**Priority when increasing load / volume (in order):**
1. **Increase reps** (toward a clear rep target; same weight and set count, same exercise).
2. **Increase weight** (small step; same target reps and set count, same exercise) once reps hit the target **consistently** across recent sessions.
3. **Increase sets by +1** (same weight and rep target) only when **weight has stagnated** for **2–3** sessions at the same rep target **and** fatigue/volume rules allow a set add.
4. **Change exercise** (variation: close substitute) only when the **same movement has stagnated 3+ sessions** (load/reps/sets not improving)—make the swap the **only** change for that slot; keep prescription realistic.

**Decision hints (read recentSessions + exercise baselines):**
- Reps **below** target but **stable** (not falling off): progress by **reps first** (priority 1).
- Reps **at target** session after session: progress by **weight** (priority 2).
- **Weight flat** 2–3 sessions at that rep target: **+1 set** if allowed (priority 3), not a bigger weight jump at the same time.
- **3+ sessions** of no progress on the same exercise: **variation** (priority 4), not a stack of other tweaks.

**Fatigue (use trainingSignals.fatigue in your output and the log):**
- **high** → **reduce** working sets; avoid adding load or new sets; prefer maintenance or small rep recovery, not new stressors.
- **moderate** → **keep** set count unless a stagnation + volume rule clearly warrants **only** a +1 set; avoid compounding new stress.
- **low** → allow progression along the priority ladder as data supports.

**Volume trend (log + trainingSignals.volumeTrend / your training_signals.volume_trend):**
- **down** → set **increase** is **allowed** when the stagnation rule (2–3 sessions) calls for it and fatigue is not high.
- **up** → **do not** increase set count; use reps or weight, or hold—never add sets for progression while trend is up.

**Per-exercise "reason" must name the one thing you changed** and why, e.g. "Reps 8→9; still below 10 target, load unchanged." or "Weight +2.5kg; hit 3×10 clean last time." or "Sets increased from 3 to 4; fatigue moderate, volume trend was decreasing, load flat two sessions." or "Swapped to incline DB press; flat bench stalled 3 weeks." Keep within the character limit.`;

const PROGRESSION_ENGINE = `## Progression engine (client-computed, use it)
The request includes **exerciseProgression**: one object per key exercise, built from the last 3–5 sessions. Warm-ups are **excluded**; repTargetRange marks **working** sets in that band. Each entry has: **history** (oldest → newest), **trend** in { improving, stable, stagnating, declining, unknown }, **stagnationSessions**, **fatigueDetected**, **volumeFalling3Sessions**, **hint** (English cue), and **stimulus** fields: **stimulusScore** (0–10), **stimulusComponents**, **stimulusInterpretation** (strong | acceptable | weak | poor), **stimulusBelowFiveLastThreeSessions** (boolean).
- Use this as the **primary** signal for how to progress each exercise, together with trainingSignals, **stimulusScore**, and recentSessions. Per-exercise "reason" should align with **trend**, **hint**, and **stimulus** when applicable.
- If **fatigueDetected** is true: do **not** add weight or sets for that exercise.
- If **volumeFalling3Sessions** is true: no load or set increases until execution stabilizes.
- **Stagnating** + low global fatigue: only one lever (reps, then weight, then +1 set, or swap) per the single-variable rules.
- **Stagnating** 3+ sessions: consider a **close exercise swap** in coach_recommended (one variable only for that slot).
- **Improving** or **stable** with no local fatigue: small planned progression is OK.
- If exerciseProgression is empty or an exercise is missing, use recentSessions and exerciseStats.`;

const STIMULUS_SCORING = `## Exercise stimulus score (client-computed, use it)
Each \`exerciseProgression\` item includes a **0–10** \`stimulusScore\` (higher = better response to the exercise recently), plus a breakdown in \`stimulusComponents\`.
- **8–10 (strong)**: keep the movement; small planned progression is appropriate when other rules allow.
- **6–7 (acceptable)**: default programming.
- **4–5 (weak)**: consider **one** of: rep emphasis, a small +set, or a **close variation** next time.
- **0–3 (poor) or** \`stimulusBelowFiveLastThreeSessions\` = true: prioritize **exercise change** (variation) or a technique-focused slot over stacking load—cite in the "reason" in the UI language, e.g. (EN) "Incline DB press stimulus has been low; try incline Smith or barbell to refresh patterning."
- Do not contradict **single-variable** or **deload/periodization** when applying stimulus.`;

const MUSCLE_VOLUME_WEEKLY = `## Weekly muscle volume (client-computed, use it)
The request includes:
- \`weeklyMuscleVolume\`: **working set** count per **primary** muscle in the last **7 calendar days** in the user timezone.
- \`muscleVolumeTrend\`: for each primary muscle, change vs the **previous** 7-day window (up | down | stable | unknown).
- \`muscleHypertrophyRanges\`: recommended **weekly** working-set bands for hypertrophy (chest, back, legs 10–20; shoulders 8–16; biceps/triceps 6–14; hamstrings 8–16; calves 6–12; etc.).
- \`muscleVolumeHistory\`: four **non-overlapping** 7-day buckets, oldest first (for long-term context).

**Map each exercise** to a primary muscle using your judgment aligned with a typical split (bench/incline/presses → **chest**; overhead presses → **shoulders**; pull-ups, rows, deadlifts (non-RDL) → **back**; RDL, leg curl → **hamstrings**; squat, leg press, leg ext → **legs**; pushdowns, extensions → **triceps**; etc.). Use the payload numbers as ground truth; do not recompute.

**Set-count decisions for this session:**
- If **weeklyMuscleVolume** for a muscle is **at or above** \`muscleHypertrophyRanges[muscle].max\`: do **not** add working sets for exercises with that target muscle. Prefer maintain sets, reduce, or use reps/weight/technique without increasing set count. Say so in the global **"reason"** and/or the exercise **"reason"** in the UI language, e.g. (EN) "Chest volume is already high this week (18 sets), so bench sets stay the same."
- If weekly volume is **inside** the range: use normal **Adaptive volume** and single-variable rules.
- If volume is **below the minimum** and fatigue allows: a **+1** working set is allowed (only one variable per exercise). Explain briefly, e.g. (EN) "Back volume is low this week (6 sets), so one extra set on rows."
- Weave **\`muscleVolumeTrend\`** and **\`weeklyMuscleVolume\`** with **exerciseProgression** and \`trainingSignals\`: "increase/maintain/reduce sets" must respect weekly caps first.

**Per-exercise "reason"**: when set count is tied to this module, add one short clause in the same language, e.g. (RU) "Объём груди на этой неделе высокий — сеты без изменений."`;

const LAGGING_MUSCLE = `## Lagging muscle & stagnation (client-computed, use it)
The request includes, **after** weekly volume:
- \`muscleProgressScore\`: one trend per **primary** muscle, rolled up from \`exerciseProgression\` (same 3× flat top weight+reps → **stagnating** rule as the progression engine; **working sets** only).
- \`laggingMuscleGroups\`: which muscles are underperforming **vs** the rest of the log (e.g. chest **stagnating** while shoulders **improving** → chest may appear here when appropriate).
- \`stagnatingExercises\`: list of exercise names (with \`primaryMuscle\` and \`trend\`) to cite in the session. **Lagging** may also list a muscle if **\`stimulusBelowFiveLastThreeSessions\` + sub-5** \`stimulusScore\` on that exercise flags a weak response pattern.
- \`laggingInterventionBlockers\`: if \`highFatigue\` is true from \`trainingSignals.fatigueSignal\` **or** a muscle is listed in \`musclesAtWeeklyVolumeMax\` (over weekly volume range), you **must not** add working sets, add a new direct exercise, or add weekly volume to that muscle—use **reps, technique, or substitution** without piling on sets instead.
- \`muscleProgressHistory\`: current snapshot (shape for future UI).

**If a muscle lags and blockers are clear:**
- You may **+1** working set on a main or accessory for that pattern, or add one **chest / back / …** fly or isolation **only** when it is the **single** variable for that slot and not blocked by \`laggingInterventionBlockers\`.
- Or keep load and **raise rep target** in range (one variable). Explain in the session "reason" or the exercise "reason" in the UI language, e.g. (EN) "Chest has stalled; one extra set on bench." or (EN) "Progression paused on incline; added a chest fly."`;

const PERIODIZATION_BLOCK = `## Periodization (4-week session cycle, client-computed)
The request includes \`periodization\`:
- **16-workout macrocycle** = 4 “training weeks” × **4 completed sessions** each, then the pattern **repeats** from week 1.
- \`trainingCycleWeek\` is 1–4: **1** = moderate, **2** = progression, **3** = peak, **4** = scheduled deload.
- \`workoutIndexInCycle\` (0–15) and \`workoutPositionInTrainingWeek\` (0–3) are your position; \`totalSessionsLogged\` is how many sessions exist before this prescription.
- \`scheduledPhase\` = phase from the week; \`effectivePhase\` = **after** rules below (may be **deload** early).
- \`forcedDeload\` = true when \`trainingSignals.fatigueSignal\` is **high** (early deload): treat the session as **deload** even if \`trainingCycleWeek\` is 1–3. Prefer "Recovery session" and technique-friendly work.
- \`deloadSetVolumeMultiplierTarget\` ≈ **0.6–0.7** in deload: **reduce working sets** by about **30–40%** vs your usual (e.g. 4 → 2–3); keep loads similar or **slightly** lighter; **no** new PR attempts or +sets progression.
- \`cycleTypePreference\` is for future (strength | hypertrophy | mixed); until the user can set it, assume **hypertrophy**-style volume priors with these bands.

**Phase behavior for the *effective* phase:**
- **moderate** — normal set counts; standard single-variable progression.
- **progression** — allow **+1** set on a **key** lift and normal weight work when not blocked by volume or lagging blockers.
- **peak** — heaviest/ highest volume the rules allow; still no violation of single-variable, weekly cap, or fatigue rules.
- **deload** — reduce **sets and total session volume**; no progression levers; emphasize execution.

**Mention the cycle in user-facing "reason" or insights** when it shapes the call, e.g. (EN) "This session falls in a higher-intensity week of your cycle (week 3)." or (EN) "Planned deload: fewer working sets to recover."`;

const AI_DECISION_CONTEXT = `## Unified decision context (primary source of truth)
The request includes \`aiDecisionContext\`. Use it as the **main** source of truth for decisions and explanations; do not try to recompute the signals.
It contains:
- \`recentWorkouts\`: compact recent sessions (for citing history).
- \`exerciseHistory\`: slim per-exercise recent rows (top set, rep drop, working sets, stimulus).
- \`fatigueSignals\`: same as \`trainingSignals\` (fatigue/volume trend/split).
- \`splitContinuityGuard\`: last split label + whether repeating it is allowed (48h rule) + preferred alternatives.
- \`muscleVolume\`: weekly volume + trend + safe ranges (+ optional history).
- \`laggingMuscles\`: lagging groups + stagnating exercises + blockers.
- \`stimulusScores\`: per-exercise stimulus 0–10 + interpretation.
- \`periodizationState\`: cycle week + effective phase (including early deload).
- \`progressionRecommendations\`: the per-exercise progression rows used by the engine.

When explaining choices, prefer phrases like:
- (EN) \"Fatigue is high, so this is an early deload.\" 
- (EN) \"Chest volume is at the weekly cap, so no extra chest sets.\" 
- (EN) \"Incline DB press stimulus has been weak; use a close variation.\"`;

const SPLIT_CONTINUITY_GUARD = `## Split continuity guard (must obey)
Use \`aiDecisionContext.splitContinuityGuard\` to avoid repeating the same split back-to-back.
- If \`guardActive\` is true and your planned split label equals \`lastWorkoutSplit\`, you must choose an alternative split.
- Choose the next split from \`preferredNextSplits\` in order.
- You may repeat the split only if \`allowSameSplit\` is true (e.g. 48+ hours passed) or the user explicitly asked to repeat/specialize.
- If this rule changes your plan, mention it briefly in the session \"reason\" in the UI language (e.g. \"Last session was Pull, so today is Push for recovery.\").`;

const SPLIT_SELECTION_ENGINE = `## Split selection engine (must obey)
The request includes \`aiDecisionContext.splitSelection\`.
- Use \`splitSelection.recommendedSplit\` as the default split to generate when it is one of Push/Pull/Legs/Full.
- When multiple next splits are allowed (e.g. after split continuity guard), do not guess: follow \`splitSelection\` candidate scoring and reasons.
- If you intentionally choose a different split than \`recommendedSplit\`, briefly explain why in the session \"reason\".
- If \`splitSelection\` is missing, fall back to \`splitContinuityGuard.preferredNextSplits[0]\`.`;

const TRAINING_SIGNALS_ENGINE = `## Training signal engine + progression planner (must obey)
The request includes these inside \`aiDecisionContext\`:
- \`trainingSignals\`: deeper context: \`exerciseTrends\`, \`fatigueTrend\`, \`muscleRecovery\`, \`progressionFocus\`, \`alerts\`.
- \`progressionPlan\`: \`globalStrategy\` and per-exercise \`exercisePlans\`.

Rules:
- Do not ignore \`progressionPlan\`. Use \`exercisePlans\` to decide whether to increase reps/weight/sets, maintain, reduce, or swap a movement.
- If \`progressionPlan.globalStrategy\` is **deload**, do not increase weight or sets; reduce working sets and keep technique.
- If an exercisePlan action is \`increase_reps\`, do not also increase weight; one variable per exercise.
- If action is \`maintain\`, explain what is being consolidated in the exercise \"reason\" (short).
- Use \`trainingSignals.muscleRecovery\` to avoid overtraining: if a target muscle is \`fatigued\`, keep direct work conservative.
- Keep explanations brief and in the UI language. You may surface up to 3 short signal facts via one insight card (optional).`;

const TRAINING_PHASE_ENGINE = `## Training phase (must obey)
The request includes \`aiDecisionContext.trainingPhase\` with:
\`phase\` in { build, consolidate, deload, unknown }, \`weekInPhase\`, and a short \`reason\`.

Rules:
- If phase = **build**: allow gradual progression (prefer reps → then small weight) when other blockers allow.
- If phase = **consolidate**: stabilize loads, maintain sets, emphasize technique and repeat quality performance.
- If phase = **deload**: reduce sets or intensity; avoid progression levers (no weight increases, no added sets).
- Mention the phase briefly in the session \"reason\" or one insight (max 1 phase insight).`;

const ADAPTIVE_VOLUME_PLAN = `## Adaptive volume plan (must obey)
The request includes \`aiDecisionContext.volumePlan.muscleVolume\`: one row per muscle with weeklySets and an action:
- action = **increase** → you may add **+1** working set for that muscle if not blocked by fatigue/weekly caps/periodization.
- action = **maintain** → keep set count stable for that muscle.
- action = **reduce** → remove **one accessory set** (or keep sets lower) for that muscle this session.
Use this together with weeklyMuscleVolume and hypertrophy ranges; when they conflict, prefer safety (do not exceed caps).`;

const systemPrompt = `You are an AI strength training coach (training intelligence layer).

Your job: read the user's log, detect patterns (progress, fatigue, balance, volume), and propose the NEXT workout with clear, evidence-based coaching.

You are not a fitness blogger. You are a practical coach. Never output generic program copy.

${ADAPTIVE_VOLUME_RULES}

${SINGLE_VARIABLE_PROGRESSION_RULES}

${PROGRESSION_ENGINE}

${STIMULUS_SCORING}

${MUSCLE_VOLUME_WEEKLY}

${LAGGING_MUSCLE}

${PERIODIZATION_BLOCK}

${AI_DECISION_CONTEXT}

${SPLIT_CONTINUITY_GUARD}

${SPLIT_SELECTION_ENGINE}

${TRAINING_SIGNALS_ENGINE}

${TRAINING_PHASE_ENGINE}

${ADAPTIVE_VOLUME_PLAN}

## Must do
- Explain why this next session is chosen (reference split rotation, fatigue, volume trend, strategy).
- For every exercise, explain why the weight/rep scheme was selected; reference real previous sets when the data exists. Cite **working** sets only: not empty-bar or very light warm-up sets. Prefer a set that matches the planned rep range, or the heaviest working set in the last session for that exercise; the app compares against local logs and may re-label.
- For every exercise, the **number of objects in "sets"** is your working-set count: follow **Adaptive volume** and **Single-variable progression** in this system message. The per-exercise **"reason"** must briefly name the **one** thing you changed (reps, weight, set count, or exercise) and tie it to fatigue, volume trend, stagnation, or rep target—under 150 characters.
- Prefer the user's real exercise names in history_based mode; in coach_recommended you may use conventional names but must justify changes.
- Keep session "reason", insights, and training_signals lines at or under 120 characters where possible. Shorter is better.
- Do not invent injuries, medical states, pain, or recovery context unless the user message explicitly provides it.
- Set "confidence" to 0–100: higher when many suggested lifts have clear recent history; lower with little history, many new exercises, or an unclear training pattern. You may lean conservative.

## Do not
- Do not use filler like "main compound movement for legs" or "isolation supports development" without data.
- Do not change **more than one** of (reps target, weight, set count, exercise) for the same exercise in one prescription, except explicit deload/recovery session rules.
- Do not output markdown or text outside the JSON object.

## UI language
The request JSON includes "language": "en" | "ru". Write every user-visible string VALUE in that language: title, reason, training_signals.split, training_signals.strategy, insights titles and text, decision_label, per-exercise reason, warnings, and exercise names if you naturalize them in that language.
- If language is "ru", use Russian for those values.
- If language is "en", use English.
JSON property names stay in English. Keep machine enum field VALUES exactly as required: "session_type" must be one of the five English session labels listed above; "fatigue", "volume_trend", and "decision" must use the English enum tokens; do not translate those enum strings or the JSON keys.

## Good vs bad
Good: "You hit 100×10×3 last session. Add one 105×10 set."
Bad: "Main compound movement for legs."

Good: "Sets increased from 3 to 4 because fatigue was moderate and volume trend was decreasing."
Bad: "More volume for growth." (no data, and implies multiple levers at once)

Good: "Triceps appeared in 2 recent sessions. Keep isolation volume moderate."
Bad: "Triceps isolation supports arm development."

## Training insights (the "insights" array)
- Return at most 3 items. If the log is too thin for concrete patterns, return an empty array.
- No generic or motivational filler; each insight must cite real data from the payload (recentSessions, exerciseProgression, exerciseStats, baselines, split pattern).
- Each "title" and "text" must be under 120 characters (insights only).
- "type" must be one of: progress | fatigue | balance | risk | opportunity. Use "risk" for load/volume/schedule concerns or injury-adjacent caution grounded in the log, not for invented medical details.
- Write "title" and "text" in the language given by "language" in the request (en or ru); keep JSON keys in English.

## Output (JSON only, no markdown)
Use this exact structure and field names:
{
  "title": string,
  "session_type": "Normal progression" | "Volume focus" | "Intensity focus" | "Recovery session" | "Technique session",
  "confidence": number,
  "reason": string (≤120 chars, why this session),
  "training_signals": {
    "split": string (short, e.g. the next focus or rotation label),
    "fatigue": "low" | "moderate" | "high" | "unknown",
    "volume_trend": "up" | "down" | "stable" | "unknown",
    "strategy": string (e.g. progressive overload, short line)
  },
  "insights": [
    { "type": "progress" | "fatigue" | "balance" | "risk" | "opportunity", "title": string, "text": string }
  ] (0–3 items, each "title" and "text" ≤120 chars; must reference real log data, or use [] if insufficient data),
  "exercises": [
    {
      "name": string,
      "sets": [ { "weight": number, "reps": number } ],
      "decision": "increase" | "maintain" | "reduce" | "technique" | "volume",
      "decision_label": string (short label for UI, e.g. "+2.5kg progression", "Maintain weight"),
      "reason": string (≤150 chars: state the single progression change + why; per Adaptive volume + single-variable rules; cite last session if possible)
    }
  ],
  "warnings": string[]
}

Use "exerciseProgression", "trainingSignals", "exerciseBaselines", and "recentSessions" in the user payload. Use "aiMode" and the MODE block. Do not echo JSON schema or field names inside user-facing strings.`;

const MODE_HISTORY_BASED = `MODE: history_based
- Strongly prefer exercises the user has already used (recentSessions, mostRecentExercises, exerciseStats, favorites).
- Keep session structure close to their pattern; minimal exercise churn.
- Progress one variable at a time per exercise (reps → weight → sets → exercise swap); their history is the template.`;

const MODE_COACH_RECOMMENDED = `MODE: coach_recommended
- Use history to estimate strength (exerciseBaselines, recentSessions, exerciseStats); loads must be realistic.
- 4–6 exercises, one clear focus (push, pull, legs, etc.).
- You may change exercises for balance; if so, that change should be the only progression lever for that slot unless deloading—align with single-variable rules.
- Use clean standard names; quickTemplates are reference only.`;

function cap(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

function isFatigue(s: string): s is FatigueSignal {
  return (FATIGUE_SET as string[]).includes(s);
}

function isVolume(s: string): s is VolumeTrend {
  return (VOLUME_SET as string[]).includes(s);
}

function isDecision(s: string): s is ExerciseDecision {
  return (DECISIONS as string[]).includes(s);
}

function isInsightType(s: string): s is AiInsight["type"] {
  return (INSIGHT_TYPES as string[]).includes(s);
}

/** Maps legacy model output to current schema. */
function normalizeInsightTypeToken(
  s: string,
): AiInsight["type"] | null {
  const t = s === "warning" ? "risk" : s;
  return isInsightType(t) ? t : null;
}

type ParsedExercise = {
  name: string;
  sets: { weight: number; reps: number }[];
  reason: string;
  decision?: ExerciseDecision;
  decision_label?: string;
};

type ParsedModel = {
  title: string;
  session_type: string;
  reason: string;
  confidence?: number;
  training_signals?: Partial<{
    split: string;
    fatigue: string;
    volume_trend: string;
    strategy: string;
  }>;
  insights?: unknown;
  exercises: ParsedExercise[];
  warnings: string[];
};

function parseExercisesArray(arr: unknown): ParsedExercise[] | null {
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 8) return null;
  const out: ParsedExercise[] = [];
  for (const ex of arr) {
    if (!ex || typeof ex !== "object") return null;
    const e = ex as Record<string, unknown>;
    if (typeof e.name !== "string" || !e.name.trim()) return null;
    const reasonRaw = e.reason;
    const reason =
      typeof reasonRaw === "string" && reasonRaw.trim()
        ? cap(reasonRaw.trim(), MAX_EXERCISE_REASON)
        : "";
    if (!Array.isArray(e.sets) || e.sets.length < 1 || e.sets.length > 12) {
      return null;
    }
    const sets: { weight: number; reps: number }[] = [];
    for (const s of e.sets) {
      if (!s || typeof s !== "object") return null;
      const r = s as Record<string, unknown>;
      const weight = Number(r.weight);
      const reps = Number(r.reps);
      if (!Number.isFinite(weight) || weight < 0) return null;
      if (!Number.isFinite(reps) || reps < 0) return null;
      sets.push({ weight, reps: Math.round(reps) });
    }
    const decision = typeof e.decision === "string" ? e.decision : undefined;
    const decision_label =
      typeof e.decision_label === "string" ? e.decision_label : undefined;
    out.push({
      name: e.name.trim(),
      reason,
      sets,
      decision: isDecision(decision ?? "")
        ? (decision as ExerciseDecision)
        : undefined,
      decision_label: decision_label?.trim(),
    });
  }
  return out;
}

function parseModelLoose(raw: unknown): ParsedModel | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== "string" || !o.title.trim()) return null;
  if (typeof o.session_type !== "string" || !o.session_type.trim()) {
    return null;
  }
  const sessionTypeNorm = o.session_type.trim();
  if (
    !SESSION_TYPES.includes(
      sessionTypeNorm as (typeof SESSION_TYPES)[number],
    )
  ) {
    return null;
  }
  if (typeof o.reason !== "string" || !o.reason.trim()) return null;
  if (!Array.isArray(o.warnings)) return null;
  const exercises = parseExercisesArray(o.exercises);
  if (!exercises) return null;
  const ts = o.training_signals;
  const training_signals =
    ts && typeof ts === "object" ? (ts as ParsedModel["training_signals"]) : undefined;
  return {
    title: o.title.trim(),
    session_type: sessionTypeNorm,
    reason: cap(o.reason.trim(), MAX_LINE),
    confidence: typeof o.confidence === "number" && Number.isFinite(o.confidence)
      ? o.confidence
      : undefined,
    training_signals,
    insights: o.insights,
    exercises,
    warnings: o.warnings.filter(
      (w) => typeof w === "string" && w.trim().length > 0,
    ) as string[],
  };
}

function parseInsightItems(raw: unknown): AiInsight[] {
  if (!Array.isArray(raw)) return [];
  const out: AiInsight[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.type !== "string" || !o.type.trim()) continue;
    const type = normalizeInsightTypeToken(o.type.trim());
    if (!type) continue;
    if (typeof o.title !== "string" || !o.title.trim()) continue;
    if (typeof o.text !== "string" || !o.text.trim()) continue;
    out.push({
      type,
      title: cap(o.title.trim(), MAX_LINE),
      text: cap(o.text.trim(), MAX_LINE),
    });
  }
  return out.slice(0, MAX_INSIGHTS);
}

function buildTrainingSignalsFromModelOrPayload(
  parsed: ParsedModel,
  input: AiCoachRequestPayload,
): AiTrainingSignalsResponse {
  const tsm = parsed.training_signals;
  if (tsm && typeof tsm === "object") {
    const split = typeof tsm.split === "string" && tsm.split.trim() ? tsm.split.trim() : null;
    const strFat = tsm.fatigue;
    const strVol = tsm.volume_trend;
    const strat = typeof tsm.strategy === "string" && tsm.strategy.trim() ? tsm.strategy.trim() : null;
    if (split && strFat && isFatigue(strFat) && strVol && isVolume(strVol) && strat) {
      return {
        split: cap(split, 160),
        fatigue: strFat,
        volume_trend: strVol,
        strategy: cap(strat, 120),
      };
    }
  }
  return buildDisplayTrainingSignals(
    input.trainingSignals,
    parsed.title,
    parsed.session_type,
  );
}

function finalizeExercises(
  list: ParsedExercise[],
): SuggestNextWorkoutResponse["exercises"] {
  return list.map((e) => {
    const r = e.reason.trim() || "Load follows your log and the suggested sets.";
    const d = e.decision ?? inferDecisionFromReason(r);
    const label = e.decision_label?.trim() || DEFAULT_DECISION_LABEL[d];
    return {
      name: e.name,
      sets: e.sets,
      reason: cap(r, MAX_EXERCISE_REASON),
      decision: d,
      decision_label: cap(label, 80),
    };
  });
}

function computeConfidenceScore(
  input: AiCoachRequestPayload,
  exerciseNames: { name: string }[],
): number {
  const stats = input.exerciseStats ?? [];
  const statByKey = new Map(
    stats.map((s) => [normalizeExerciseName(s.name), s]),
  );
  const recent = input.recentSessions?.length ?? 0;
  let base = 74;
  if (recent === 0) base -= 30;
  else if (recent < 2) base -= 14;
  if (!input.trainingSignals?.recentSplitPattern?.length && recent < 3) {
    base -= 12;
  }
  if (exerciseNames.length === 0) {
    return Math.max(8, Math.min(96, Math.round(base)));
  }
  let withHistory = 0;
  for (const e of exerciseNames) {
    const n = normalizeExerciseName(e.name);
    const st = statByKey.get(n);
    if (st && st.sessionsInHistory > 0) withHistory += 1;
  }
  const ratio = withHistory / exerciseNames.length;
  const unknown = exerciseNames.length - withHistory;
  const step = base * (0.28 + 0.72 * ratio) - unknown * 5.5;
  return Math.max(8, Math.min(96, Math.round(step)));
}

function mergeConfidence(
  modelConf: number | undefined,
  server: number,
): number {
  if (modelConf === undefined || !Number.isFinite(modelConf)) {
    return server;
  }
  const m = Math.max(0, Math.min(100, Math.round(modelConf)));
  return Math.max(0, Math.min(100, Math.round(0.42 * m + 0.58 * server)));
}

function finalizeResponse(
  parsed: ParsedModel,
  input: AiCoachRequestPayload,
): SuggestNextWorkoutResponse {
  const training_signals = buildTrainingSignalsFromModelOrPayload(
    parsed,
    input,
  );
  const exercises = finalizeExercises(parsed.exercises);
  const insights = parseInsightItems(parsed.insights);
  const confServer = computeConfidenceScore(input, exercises);
  const confidence = mergeConfidence(parsed.confidence, confServer);
  return {
    title: parsed.title,
    session_type: parsed.session_type,
    reason: cap(parsed.reason, MAX_LINE),
    confidence,
    training_signals,
    insights,
    exercises,
    warnings: parsed.warnings,
  };
}

export function getFallbackNextWorkoutSuggestion(): SuggestNextWorkoutResponse {
  const full = QUICK_WORKOUT_TEMPLATES.find((t) => t.id === "full");
  const names = full
    ? [...full.exercises].slice(0, 5)
    : [
        "Squat",
        "Barbell Bench Press",
        "Pull-ups",
        "Romanian Deadlift",
        "Dumbbell Shoulder Press",
      ];
  const base: ParsedModel = {
    title: "Full body (default)",
    session_type: "Normal progression",
    reason: cap(
      "Add OPENAI_API_KEY to your environment for a personalized next session. This is a balanced template; adjust loads before training.",
      MAX_LINE,
    ),
    exercises: names.map((name) => ({
      name,
      reason: cap("Default from the in-app full-body template.", MAX_EXERCISE_REASON),
      sets: [
        { weight: 20, reps: 10 },
        { weight: 20, reps: 10 },
        { weight: 20, reps: 10 },
      ],
      decision: "maintain",
      decision_label: DEFAULT_DECISION_LABEL.maintain,
    })),
    warnings: [
      "This is a non-AI fallback. Set loads to match your level before training.",
    ],
  };
  const minimalPayload: AiCoachRequestPayload = {
    language: "en",
    aiMode: "history_based",
    athleteProfile: {},
    recentSessions: [],
    logTotals: { totalVolume: 0, totalSetCount: 0 },
    mostRecentExercises: [],
    exerciseStats: [],
    favorites: [],
    settings: { timezone: "UTC" },
    trainingContext: {
      trainingPhase: "",
      goal: "general_fitness",
      progressionMode: "progressive overload",
    },
    trainingSignals: {
      recentSplitPattern: [],
      lastWorkedMuscleGroups: [],
      volumeTrend: "unknown",
      fatigueSignal: "unknown",
      exerciseBaselines: [],
    },
    exerciseProgression: [],
    ...EMPTY_MUSCLE_VOLUME_BLOCK,
    ...EMPTY_LAGGING_MUSCLE_BLOCK,
    periodization: { ...EMPTY_PERIODIZATION },
    aiDecisionContext: {
      recentWorkouts: [],
      exerciseHistory: [],
      fatigueSignals: {
        recentSplitPattern: [],
        lastWorkedMuscleGroups: [],
        volumeTrend: "unknown",
        fatigueSignal: "unknown",
        exerciseBaselines: [],
      },
      splitContinuityGuard: {
        lastWorkoutSplit: "Unknown",
        hoursSinceLastWorkout: null,
        allowSameSplit: true,
        guardActive: false,
        preferredNextSplits: ["Push", "Pull", "Legs", "Full"],
        reasons: [],
        specializationModeEnabled: false,
      },
      muscleVolume: {
        weeklyMuscleVolume: { ...EMPTY_MUSCLE_VOLUME_BLOCK.weeklyMuscleVolume },
        muscleVolumeTrend: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleVolumeTrend },
        muscleHypertrophyRanges: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleHypertrophyRanges },
      },
      laggingMuscles: { ...EMPTY_LAGGING_MUSCLE_BLOCK },
      progressionRecommendations: { exerciseProgression: [] },
      periodizationState: { ...EMPTY_PERIODIZATION },
      stimulusScores: [],
      athleteProfile: {},
      aiMode: "history_based",
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
        weekInPhase: 1,
        reason: "",
        fatigueIndicator: "unknown",
        volumeIndicator: "moderate",
      },
      volumePlan: { muscleVolume: [] },
    },
    quickTemplates: [],
  };
  return finalizeResponse(base, minimalPayload);
}

function normalizeSuggestPayload(
  body: AiCoachRequestPayload,
): AiCoachRequestPayload {
  const aiMode: AiCoachRequestPayload["aiMode"] =
    body.aiMode === "coach_recommended" ? "coach_recommended" : "history_based";
  return {
    ...body,
    aiMode,
    language: parseAppLanguage(body.language),
    exerciseProgression: Array.isArray(body.exerciseProgression)
      ? (body.exerciseProgression
          .filter(
            (x) => x != null && typeof x === "object",
          )
          .map((ex) => {
            if (
              "stimulusScore" in ex &&
              typeof (ex as { stimulusScore: unknown }).stimulusScore ===
                "number" &&
              Number.isFinite((ex as { stimulusScore: number }).stimulusScore)
            ) {
              return ex as ExerciseProgressionForAi;
            }
            return { ...DEFAULT_STIMULUS, ...ex } as ExerciseProgressionForAi;
          }))
      : [],
    weeklyMuscleVolume: {
      ...EMPTY_MUSCLE_VOLUME_BLOCK.weeklyMuscleVolume,
      ...(body.weeklyMuscleVolume && typeof body.weeklyMuscleVolume === "object"
        ? body.weeklyMuscleVolume
        : {}),
    },
    muscleVolumeTrend: {
      ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleVolumeTrend,
      ...(body.muscleVolumeTrend && typeof body.muscleVolumeTrend === "object"
        ? body.muscleVolumeTrend
        : {}),
    },
    muscleVolumeHistory: Array.isArray(body.muscleVolumeHistory)
      ? body.muscleVolumeHistory
      : [],
    muscleHypertrophyRanges: {
      ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleHypertrophyRanges,
      ...(body.muscleHypertrophyRanges &&
      typeof body.muscleHypertrophyRanges === "object"
        ? body.muscleHypertrophyRanges
        : {}),
    },
    muscleProgressScore: {
      ...EMPTY_LAGGING_MUSCLE_BLOCK.muscleProgressScore,
      ...(body.muscleProgressScore &&
      typeof body.muscleProgressScore === "object"
        ? body.muscleProgressScore
        : {}),
    },
    laggingMuscleGroups: Array.isArray(body.laggingMuscleGroups)
      ? body.laggingMuscleGroups
      : [],
    stagnatingExercises: Array.isArray(body.stagnatingExercises)
      ? body.stagnatingExercises
      : [],
    laggingInterventionBlockers: (() => {
      const b = body.laggingInterventionBlockers;
      if (b && typeof b === "object" && "highFatigue" in b) {
        return {
          highFatigue: Boolean(
            (b as { highFatigue?: boolean }).highFatigue,
          ),
          musclesAtWeeklyVolumeMax: Array.isArray(
            (b as { musclesAtWeeklyVolumeMax?: unknown })
              .musclesAtWeeklyVolumeMax,
          )
            ? ((b as { musclesAtWeeklyVolumeMax: PrimaryMuscleGroup[] })
                .musclesAtWeeklyVolumeMax)
            : [],
        };
      }
      return { ...EMPTY_LAGGING_MUSCLE_BLOCK.laggingInterventionBlockers };
    })(),
    muscleProgressHistory: Array.isArray(body.muscleProgressHistory)
      ? body.muscleProgressHistory
      : [],
    periodization: (() => {
      const p = body.periodization;
      if (p && typeof p === "object") {
        const c = p as Record<string, unknown>;
        return {
          ...EMPTY_PERIODIZATION,
          trainingCycleWeek: [1, 2, 3, 4].includes(
            c.trainingCycleWeek as number,
          )
            ? (c.trainingCycleWeek as 1 | 2 | 3 | 4)
            : EMPTY_PERIODIZATION.trainingCycleWeek,
          workoutIndexInCycle:
            typeof c.workoutIndexInCycle === "number" && Number.isFinite(c.workoutIndexInCycle)
              ? Math.max(
                  0,
                  Math.min(15, Math.floor(c.workoutIndexInCycle)),
                )
              : EMPTY_PERIODIZATION.workoutIndexInCycle,
          workoutPositionInTrainingWeek: [0, 1, 2, 3].includes(
            c.workoutPositionInTrainingWeek as number,
          )
            ? (c.workoutPositionInTrainingWeek as 0 | 1 | 2 | 3)
            : EMPTY_PERIODIZATION.workoutPositionInTrainingWeek,
          totalSessionsLogged:
            typeof c.totalSessionsLogged === "number" && Number.isFinite(c.totalSessionsLogged)
              ? Math.max(0, c.totalSessionsLogged)
              : EMPTY_PERIODIZATION.totalSessionsLogged,
          scheduledPhase:
            c.scheduledPhase === "moderate" ||
            c.scheduledPhase === "progression" ||
            c.scheduledPhase === "peak" ||
            c.scheduledPhase === "deload"
              ? c.scheduledPhase
              : EMPTY_PERIODIZATION.scheduledPhase,
          effectivePhase:
            c.effectivePhase === "moderate" ||
            c.effectivePhase === "progression" ||
            c.effectivePhase === "peak" ||
            c.effectivePhase === "deload"
              ? c.effectivePhase
              : EMPTY_PERIODIZATION.effectivePhase,
          forcedDeload:
            typeof c.forcedDeload === "boolean"
              ? c.forcedDeload
              : EMPTY_PERIODIZATION.forcedDeload,
          deloadSetVolumeMultiplierTarget:
            typeof c.deloadSetVolumeMultiplierTarget === "number" &&
            Number.isFinite(c.deloadSetVolumeMultiplierTarget)
              ? c.deloadSetVolumeMultiplierTarget
              : EMPTY_PERIODIZATION.deloadSetVolumeMultiplierTarget,
          cycleTypePreference:
            c.cycleTypePreference === "strength" ||
            c.cycleTypePreference === "hypertrophy" ||
            c.cycleTypePreference === "mixed"
              ? c.cycleTypePreference
              : EMPTY_PERIODIZATION.cycleTypePreference,
        };
      }
      return { ...EMPTY_PERIODIZATION };
    })(),
    aiDecisionContext:
      body.aiDecisionContext && typeof body.aiDecisionContext === "object"
        ? (body.aiDecisionContext as AiCoachRequestPayload["aiDecisionContext"])
        : {
            recentWorkouts: [],
            exerciseHistory: [],
            fatigueSignals: body.trainingSignals ?? {
              recentSplitPattern: [],
              lastWorkedMuscleGroups: [],
              volumeTrend: "unknown",
              fatigueSignal: "unknown",
              exerciseBaselines: [],
            },
            splitContinuityGuard: {
              lastWorkoutSplit: "Unknown",
              hoursSinceLastWorkout: null,
              allowSameSplit: true,
              guardActive: false,
              preferredNextSplits: ["Push", "Pull", "Legs", "Full"],
              reasons: [],
              specializationModeEnabled: false,
            },
            muscleVolume: {
              weeklyMuscleVolume: { ...EMPTY_MUSCLE_VOLUME_BLOCK.weeklyMuscleVolume },
              muscleVolumeTrend: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleVolumeTrend },
              muscleHypertrophyRanges: { ...EMPTY_MUSCLE_VOLUME_BLOCK.muscleHypertrophyRanges },
            },
            laggingMuscles: { ...EMPTY_LAGGING_MUSCLE_BLOCK },
            progressionRecommendations: { exerciseProgression: body.exerciseProgression ?? [] },
            periodizationState: { ...EMPTY_PERIODIZATION },
            stimulusScores: [],
            athleteProfile: body.athleteProfile ?? {},
            aiMode,
            trainingSignals: {
              exerciseTrends: [],
              muscleRecovery: [],
              fatigueTrend: {
                level: body.trainingSignals?.fatigueSignal ?? "unknown",
                reasons: [],
              },
              progressionFocus: "maintain",
              alerts: [],
            },
            progressionPlan: { globalStrategy: "maintain", exercisePlans: [] },
            trainingPhase: {
              phase: "unknown",
              weekInPhase: 1,
              reason: "",
              fatigueIndicator: body.trainingSignals?.fatigueSignal ?? "unknown",
              volumeIndicator: "moderate",
            },
            volumePlan: { muscleVolume: [] },
          },
  };
}

function buildSuggestNextAiDebug(
  input: AiCoachRequestPayload,
): SuggestNextWorkoutResponse["aiDebug"] {
  const recent = input.aiDecisionContext?.recentWorkouts?.[0];
  const g = input.aiDecisionContext?.splitContinuityGuard;
  const sel = input.aiDecisionContext?.splitSelection;
  return {
    lastWorkoutTitle: recent?.title?.trim() || "—",
    performedAt: recent?.performedAt,
    createdAt: recent?.createdAt ?? "—",
    lastWorkoutSplit: g?.lastWorkoutSplit ?? "Unknown",
    guardActive: Boolean(g?.guardActive),
    preferredNextSplits: g?.preferredNextSplits
      ? [...g.preferredNextSplits]
      : [],
    splitSelection: sel
      ? {
          recommendedSplit: sel.recommendedSplit,
          candidates: sel.candidates.map((c) => ({ split: c.split, score: c.score })),
          reason: sel.reason,
        }
      : undefined,
  };
}

function withSuggestNextDevDebug(
  r: SuggestNextWorkoutResponse,
  input: AiCoachRequestPayload,
): SuggestNextWorkoutResponse {
  if (process.env.NODE_ENV === "development") {
    return { ...r, aiDebug: buildSuggestNextAiDebug(input) };
  }
  return r;
}

function responseViolatesSplitGuard(
  r: SuggestNextWorkoutResponse,
  input: AiCoachRequestPayload,
): boolean {
  const g = input.aiDecisionContext?.splitContinuityGuard;
  if (!g) return false;
  const label = inferWorkoutSplitFromTitleAndExercises({
    title: r.title,
    exercises: r.exercises,
  });
  return splitRepetitionViolatesGuard(g, label);
}

function buildSplitGuardFallbackSuggestion(
  input: AiCoachRequestPayload,
): SuggestNextWorkoutResponse {
  const g = input.aiDecisionContext?.splitContinuityGuard;
  const preferred = g?.preferredNextSplits?.[0] ?? "Push";
  const id =
    preferred === "Push"
      ? "push"
      : preferred === "Pull"
        ? "pull"
        : preferred === "Legs"
          ? "legs"
          : "full";
  const t =
    QUICK_WORKOUT_TEMPLATES.find((x) => x.id === id) ??
    QUICK_WORKOUT_TEMPLATES.find((q) => q.id === "push")!;
  const last = g?.lastWorkoutSplit ?? "Unknown";
  const base: ParsedModel = {
    title: `${t.label} (split guard)`,
    session_type: "Normal progression",
    reason: cap(
      `Your last session was ${String(last)}. This follow-up is ${t.label} so the same pattern is not repeated within 48h.`,
      MAX_LINE,
    ),
    exercises: [...t.exercises].map((name) => ({
      name,
      reason: cap(
        "Picked to satisfy split continuity. Match loads to your log and equipment.",
        MAX_EXERCISE_REASON,
      ),
      sets: [
        { weight: 20, reps: 10 },
        { weight: 20, reps: 10 },
        { weight: 20, reps: 10 },
      ],
      decision: "maintain" as const,
      decision_label: DEFAULT_DECISION_LABEL.maintain,
    })),
    warnings: [
      "Split continuity guard: the model repeated your last training split, so a template from your preferred alternatives was used. Adjust weights before training.",
    ],
  };
  return finalizeResponse(base, input);
}

async function openAiSuggestChat(
  apiKey: string,
  systemContent: string,
  firstUser: string,
  followUp?: { assistantJson: string; userRetry: string },
): Promise<string | null> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
    { role: "user", content: firstUser },
  ];
  if (followUp) {
    messages.push(
      { role: "assistant", content: followUp.assistantJson },
      { role: "user", content: followUp.userRetry },
    );
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[ai-coach] OpenAI HTTP error", res.status, errText);
    return null;
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    console.error("[ai-coach] OpenAI empty content");
    return null;
  }
  return content;
}

function parseAndFinalize(content: string, input: AiCoachRequestPayload) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    console.error("[ai-coach] JSON parse failed");
    return null;
  }
  const loose = parseModelLoose(parsed);
  if (!loose) return null;
  return finalizeResponse(loose, input);
}

export async function fetchSuggestNextWorkoutFromOpenAI(
  input: AiCoachRequestPayload,
  apiKey: string,
): Promise<SuggestNextWorkoutResponse | null> {
  const payload = normalizeSuggestPayload(input);
  const modeBlock =
    payload.aiMode === "coach_recommended"
      ? MODE_COACH_RECOMMENDED
      : MODE_HISTORY_BASED;
  const systemContent = `${systemPrompt}\n\n${modeBlock}`;
  const user = `The JSON payload includes aiMode, aiDecisionContext, trainingSignals, trainingContext, recentSessions, exerciseStats, exerciseProgression, periodization, weeklyMuscleVolume, muscleVolumeTrend, muscleVolumeHistory, muscleHypertrophyRanges, muscleProgressScore, laggingMuscleGroups, stagnatingExercises, laggingInterventionBlockers, muscleProgressHistory, quickTemplates, and more. OBEY MODE and output only the required JSON.

${JSON.stringify(payload)}`;

  const content1 = await openAiSuggestChat(apiKey, systemContent, user);
  if (!content1) return null;
  const result1 = parseAndFinalize(content1, payload);
  if (!result1) return null;

  if (!responseViolatesSplitGuard(result1, payload)) {
    if (process.env.NODE_ENV === "development") {
      const g = payload.aiDecisionContext?.splitContinuityGuard;
      if (g) {
        const inferred = inferWorkoutSplitFromTitleAndExercises({
          title: result1.title,
          exercises: result1.exercises,
        });
        console.log("[ai-coach] split post-check: OK", {
          suggestedSplit: inferred,
          lastWorkoutSplit: g.lastWorkoutSplit,
          guardActive: g.guardActive,
        });
      }
    }
    return withSuggestNextDevDebug(result1, payload);
  }

  if (process.env.NODE_ENV === "development") {
    const g2 = payload.aiDecisionContext?.splitContinuityGuard;
    console.warn("[ai-coach] split guard: first response repeated last split", {
      last: g2?.lastWorkoutSplit,
      title: result1.title,
    });
  }

  const g = payload.aiDecisionContext?.splitContinuityGuard;
  const preferredList = g?.preferredNextSplits?.length
    ? g.preferredNextSplits.join(", ")
    : "Push, Pull, or Legs";
  const lastSplit = g?.lastWorkoutSplit ?? "the last one";
  const retryUser = `The JSON you returned is INVALID for split continuity. It repeats the same training split as the user's most recent completed session, which is NOT allowed while splitContinuityGuard.guardActive is true.

Last session split: ${String(lastSplit)}
You MUST select a different split for this prescription. Choose EXACTLY ONE of these: ${preferredList}

Return a complete NEW JSON object using the same schema. Rewrite title, exercises, training_signals.split, and the global reason so the session clearly uses one of the allowed splits and does NOT repeat ${String(lastSplit)}. Do not return the same split as the last session.`;

  const content2 = await openAiSuggestChat(apiKey, systemContent, user, {
    assistantJson: content1,
    userRetry: retryUser,
  });

  if (content2) {
    const result2 = parseAndFinalize(content2, payload);
    if (result2 && !responseViolatesSplitGuard(result2, payload)) {
      if (process.env.NODE_ENV === "development") {
        console.log("[ai-coach] split guard: second response accepted");
      }
      return withSuggestNextDevDebug(result2, payload);
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[ai-coach] split guard: using template fallback (preferredNextSplits[0])",
    );
  }
  const fallback = buildSplitGuardFallbackSuggestion(payload);
  return withSuggestNextDevDebug(fallback, payload);
}
