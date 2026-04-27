## Routes

Major Next.js App Router pages (entry points):

- `/` → `app/(panel)/page.tsx` (today / workout logging entry)
- `/onboarding` → `app/onboarding/page.tsx` (onboarding flow)
- `/history` → `app/(panel)/history/page.tsx` (progress + workout history list)
- `/progress/[exerciseId]` → `app/(panel)/progress/[exerciseId]/page.tsx` (exercise strength progress: estimated 1RM series + session table; see `ExerciseProgressView`)
- `/exercises` → `app/(panel)/exercises/page.tsx` (exercise list)
- `/exercises/[id]` → `app/(panel)/exercises/[id]/page.tsx` (exercise detail + stats)
- `/workout/[id]` → `app/(panel)/workout/[id]/page.tsx` (workout session detail)
- `/workout/[id]/edit` → `app/(panel)/workout/[id]/edit/page.tsx` (edit logged session)
- `/settings` → `app/(panel)/settings/page.tsx` (settings)
- `/dev/ai-traces` → `app/(panel)/dev/ai-traces/page.tsx` (**development only** — 404 in production; Dexie `aiDecisionTraces` viewer)

Core page components live under `src/components/pages/*`:

- `src/components/pages/WorkoutView.tsx`
- `src/components/pages/WorkoutDetailView.tsx`
- `src/components/pages/HistoryView.tsx`
- `src/components/pages/ExercisesView.tsx`
- `src/components/pages/ExerciseDetailView.tsx`
- `src/components/pages/SettingsView.tsx`
- `src/components/pages/OnboardingView.tsx`
- `src/components/pages/ExerciseProgressView.tsx` (strength series + session history for one catalog exercise)

**App route (exercise progress)**

- `app/(panel)/progress/[exerciseId]/page.tsx` — async route; renders `ExerciseProgressView`

**UI components (Progress-related)**

- `src/components/ui/SparklineChart.tsx` — compact trend polyline (History strength rows, Exercise Progress)
- `src/components/ui/TrainingConsistencyCard.tsx` — consistency score, 7d workouts, streak, recency (History)

**Workout review (post-session AI)**

- `src/components/workout/WorkoutReviewContent.tsx` — used after save on `WorkoutView` and on `WorkoutDetailView` (inline). Sections: **workout summary** (volume, sets, exercise count, duration), **by exercise** breakdown, then AI **what went well** (`InsightCard` / `went_well`), **what to adjust** (`needs_attention` / `warnings`), **next workout hint** (from last suggest-next `training_signals` when passed), next-session focus, key-lift notes. Clarifies the **post-workout AI feedback loop** before the next recommendation.

**Developer tooling (dev-only route)**

- `src/components/dev/AiTracesDevView.tsx` — table + detail for `aiDecisionTraces` (see `/dev/ai-traces`)

## API Endpoints

AI coach endpoints (Next route handlers under `app/api/ai-coach/*`):

- `POST /api/ai-coach/suggest-next-workout`
  - Route: `app/api/ai-coach/suggest-next-workout/route.ts`
  - Orchestrator: `src/server/aiCoachSuggestNext.ts`
  - Notes: has a **template fallback** when `OPENAI_API_KEY` is missing.
- `POST /api/ai-coach/review-workout`
  - Route: `app/api/ai-coach/review-workout/route.ts`
  - Orchestrator: `src/server/aiCoachReviewWorkout.ts` (called by the route)
  - Notes: server returns the review result only; coach memory is inferred + recorded client-side into Dexie.

## Database Tables

Dexie schema is defined in `src/db/database.ts` (`LifeExecutionDB`).

Training-related tables (local-first, device-only):

- `athleteProfiles`
  - profile + onboarding state (e.g. `onboardingCompleted`, goal, experience, equipment, limitations)
  - Helpers: `src/db/athleteProfile.ts`
- `workoutSessions`
  - complete logged sessions, including exercises/sets and optional AI review
  - Helpers: `src/db/workoutSessions.ts`
- `exercises`
  - canonical exercise catalog (Dexie is the source of truth; seeded + enriched from `EXERCISE_LIBRARY` + `EXERCISE_METADATA_V1`, plus user `custom`)
  - Helpers: `src/db/exercises.ts` (catalog sync/enrichment + canonical helpers)
  - Resolver utilities: `src/services/exerciseCatalogResolve.ts` (resolve session exercise → catalog exercise; metadata attribution helpers)
- `userSettings`
  - app settings (language, preferences)
  - Helpers: `src/db/settings.ts`
- `coachMemory`
  - durable AI coach memory entries (exercise-level decisions inferred from review notes)
  - Helpers: `src/db/coachMemory.ts`
- `aiDecisionTraces`
  - dev-only persisted suggest-next debug traces (survive reloads; minimal fields only)
  - Helpers: `src/db/aiDecisionTrace.ts`

## AI Engines

Major “AI coach” modules and deterministic engines:

- Decision context pipeline:
  - `src/services/aiCoachDecisionPipeline.ts` (`buildAiCoachDecisionContext`)
- AI payload assembly:
  - `src/services/aiCoachContext.ts` (`buildAiCoachRequestPayload`) includes `exerciseCatalog` sourced from Dexie `exercises`
  - `src/services/aiCoachContext.ts` also attaches `coachMemory` sourced from Dexie (`payload.coachMemory`)
- Suggest-next orchestration:
  - `src/server/aiCoachSuggestNext.ts` (selection driven by payload `exerciseCatalog`; retains a legacy fallback only if catalog is empty)
  - **Post-generation progression safety (history-based OpenAI path only):** `src/server/aiCoach/suggestNext/progressionGuards.ts` — `applySuggestNextProgressionGuards` runs in `finalizeResponse` **after** structure merge and `applyFatigueBasedProgression`, without changing LLM prompts. It **reconciles** prescribed sets/loads with `aiDecisionContext.progressionPlan`, last-session **baselines**, **exerciseHistory** (rate-limit back-to-back weight steps), and **weekly muscle volume** (no extra working sets when a muscle is at/above cap). **Surfacing:** merged into `warnings`, snippet in per-exercise `reason`, full list in **`aiDebug.progressionGuards`**. *Not* applied to `coach_recommended` / template or split-guard fallbacks (follow-up: extend if needed; see `docs/product-roadmap-v2.md`).  
  - Memory: server runtime consumes `payload.coachMemory` (no server-side storage reads)
  - Dev trace persistence: `src/components/pages/WorkoutView.tsx` writes a minimal trace to Dexie after client normalization of the suggest-next response (`requestNextWorkout()`)
- Exercise selection / rotation:
  - `src/services/exerciseSelectionEngine.ts` (deterministic structure selection + rotation penalties)
- Training science engines:
  - `src/lib/progressionEngine.ts`
  - `src/lib/periodizationEngine.ts`
  - `src/services/recoveryEngine.ts`
  - `src/services/loadManagementEngine.ts`
  - `src/services/trainingAdaptationEngine.ts`
- Insights generation:
  - `src/server/generateWorkoutInsights.ts`

## Analytics (real, reusable)

Canonical analytics modules (shared by UI and AI payload builders where applicable):

- `src/lib/analytics/muscleVolume.ts`
  - canonical muscle volume engine (working sets, primary+secondary attribution, 7-day/previous/history windows, tonnage)
- `src/lib/analytics/oneRepMax.ts`
  - estimated 1RM utilities (Epley default + Brzycki) and best-set selection
- `src/lib/analytics/strengthSeries.ts`
  - strength progression series builder (estimated 1RM points over time; lift classification uses metadata-first with name fallback)
- `src/lib/analytics/consistency.ts`
  - training consistency analytics (unique training days, streaks, recency, score/status)

## Notes for new developers

- Persistence is currently **Dexie-only** (no auth, no server DB, no sync).
- Several behaviors explicitly fall back to templates when `OPENAI_API_KEY` is not set.
- Analytics/progress are **metadata-first** using the canonical Dexie exercise catalog, with legacy name/regex fallbacks for old/orphan session data.
- Durable coach memory is stored locally in Dexie and provided to suggest-next via the client payload.

## Progress / History screen (`HistoryView`)

The `/history` UI (`src/components/pages/HistoryView.tsx`) now consumes the **shared analytics engines** (no duplicate volume math for the main blocks):

- **Consistency** — `src/lib/analytics/consistency.ts` (`buildTrainingConsistencyAnalytics`) for score, status, streak, workouts in last 7 days, days since last session.
- **Canonical muscle volume** — `src/lib/analytics/muscleVolume.ts` (`buildCanonicalMuscleVolumeAnalytics`) for 7-day working sets by primary muscle (with legs as legs+hamstrings in the UI), previous 7-day comparison, and trend hints.
- **Strength series** — `src/lib/analytics/strengthSeries.ts` (`buildStrengthSeries`) for squat/bench/deadlift trend (estimated 1RM) and links to per-exercise **Exercise Progress** (`/progress/[exerciseId]`).

Weekly “training load” bars still use **session `totalVolume`** by weekday (calendar week), not the muscle engine.

## Coach Memory Flow (durable, local-first)

- Review result → client inference → Dexie `coachMemory` → suggest-next payload → server runtime
  - `POST /api/ai-coach/review-workout` returns `WorkoutAiReview` (includes `exercise_notes`)
  - Client infers memory signals from note text: `src/services/aiCoachMemoryInference.ts`
  - Client writes entries to Dexie: `src/db/coachMemory.ts`
  - Client attaches memory context to suggest-next payload: `AiCoachRequestPayload.coachMemory`
  - Server uses `payload.coachMemory` in runtime for deterministic engines + prompt context

## AI Decision Trace Flow (dev-only, minimal)

- Suggest-next response → client normalization → Dexie `aiDecisionTraces`
  - Trace write location: `src/components/pages/WorkoutView.tsx` (`requestNextWorkout()`)
  - Stored data is minimal (no prompt, no full payload): mode/source/split, calibration flags, per-exercise load sources, exercise names
- **Trace viewer UI** (local dev only): `app/(panel)/dev/ai-traces/page.tsx` + `AiTracesDevView` — `listAiDecisionTraces` / `clearAiDecisionTraces` for inspection and reset

