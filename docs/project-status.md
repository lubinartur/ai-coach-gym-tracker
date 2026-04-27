# CoAIch — Project Status

This document reflects the **actual current implementation** in this repository (not planned features).

## Architecture Overview

- **Next.js App Router**: UI routes live under `app/` (e.g. `app/(panel)/*`, `app/onboarding/*`).
- **Local-first Dexie database**: persistence is device-local via `LifeExecutionDB` in `src/db/database.ts`.
- **AI endpoints under `app/api/*`**: AI coach endpoints are implemented as Next.js route handlers (e.g. `app/api/ai-coach/*`).
- **Server logic under `src/server/*`**: orchestration + OpenAI calls + prompt assembly live here (e.g. `src/server/aiCoachSuggestNext.ts`).
- **AI decision engines under `src/services` and `src/lib`**: deterministic selection + training engines (progression, recovery, periodization, load mgmt).
- **Post-generation progression safety** (suggest-next, history-based path): see [Progression safety (suggest-next)](#progression-safety-suggest-next) below.

## Implemented Systems

| System | Status | Completion % |
|---|---|---:|
| Onboarding System | Implemented | 85% |
| AI Workout Generation System | Implemented (incl. post-LLM progression guards on history-based suggest-next) | ~72% |
| Exercise Database | Implemented (improved) | 90% |
| Workout Session System | Implemented | 85% |
| Progress & Analytics System | Partially implemented (improved) | ~80% |
| AI Decision Pipeline | Implemented | 75% |
| Training Science Model | Implemented | 70% |
| AI Coach UI / Dashboard | Implemented (Phase 2–3 UX: coach + review + dev trace) | ~88% |
| Exercise Rotation System | Implemented | 70% |
| AI Memory / Preference Learning | Partially implemented (improved) | 65% |

## Key Observations

- The app is currently **local-first and single-device**.
- **Dexie** is used for persistence (`src/db/database.ts`), with local tables for workouts/exercises/settings.
- AI generation has **fallback templates when `OPENAI_API_KEY` is missing**:
  - Example: `app/api/ai-coach/suggest-next-workout/route.ts` returns a fallback suggestion when the key is absent.
- **Dexie `exercises` is the canonical exercise catalog** (not `EXERCISE_LIBRARY` / ad-hoc fallbacks):
  - Workout logging persists stable `exerciseId` wherever possible (`WorkoutExercise.exerciseId`) and keeps a name snapshot for display/history.
  - AI suggest-next payload includes `exerciseCatalog` from Dexie, and selection is driven by that canonical catalog (with a legacy fallback only if the catalog is empty).
  - Progress & analytics prefer canonical Dexie metadata (`primaryMuscle`, `secondaryMuscles`, `movementPattern`, `equipmentTags`) with safe fallbacks for old/orphan data.

## Progression safety (suggest-next)

- **Post-generation guards** run in `finalizeResponse` after the model output is merged with structure and `applyFatigueBasedProgression` — implementation: `src/server/aiCoach/suggestNext/progressionGuards.ts` (`applySuggestNextProgressionGuards`). **Scope today:** **history-based** OpenAI suggest-next only; **not** `coach_recommended` templates, split-guard fallbacks, or no-key fallbacks.
- **What they do (no prompt changes):** validate and correct **prescribed load and set count** using:
  - **`aiDecisionContext.progressionPlan`**: e.g. do not allow a **weight** increase when the plan says **increase_reps**; **maintain** allows no load or set increase vs last session; **reduce_weight** / **reduce_sets** cap weight and sets to last log; under **high fatigue**, **increase_weight** / **increase_sets** are treated as **maintain** for these checks.
  - **Rate limit:** if the **last** logged session already **stepped weight** vs the session before, the next prescription does not add another weight jump (when history has two consecutive `recent` points).
  - **Weekly volume at max:** if a muscle is at/above the weekly cap (from `musclesAtWeeklyVolumeMax`, `weeklyMuscleVolume` vs hypertrophy max, and runtime muscle volume), **extra working sets** for that muscle are not added (cap vs last session or a safe default when no baseline).
- **Surfacing:** guard lines are merged into the response **`warnings`** array, appended in part to the affected exercise **`reason`**, and the full list is available on **`aiDebug.progressionGuards`** when any guard ran.
- **Follow-up (docs-only intent):** extend the same post-generation pass to **coach_recommended** and **template / fallback** paths if product wants parity; see `docs/product-roadmap-v2.md`.

## Phase 2 Progress

**Completed (accepted)**

- **AI Coach Result Card UX** — clearer hero (split, session type, confidence, calibration copy), single training-signals block, per-exercise `reason` via coach notes, stronger CTA, dev debug de-emphasized.
- **Progress / History screen hierarchy** — order: training consistency → weekly load → strength → totals → history; `TrainingConsistencyCard`; scope labels; i18n; `SparklineChart` extracted.
- **Exercise Progress View** — per-exercise screen at `app/(panel)/progress/[exerciseId]/page.tsx` using `buildStrengthSeries` (estimated 1RM, session table); links from Strength rows on History.
- **AI Coach explainability (UI only)** — split reasoning line (`aiDebug.splitSelection.reason` + fallback), per-exercise load source from `exerciseLoadDebug`, “Last time” from baselines; no AI/server logic changes.
- **Muscle volume on Progress** — `HistoryView` surfaces `buildCanonicalMuscleVolumeAnalytics` (7-day working sets by muscle, vs prior week, trend, empty states).

**Remaining in Phase 2 (see `docs/product-roadmap-v2.md`)**

- Optional polish: AI Coach dashboard visual design, longer-term plan engine deferred to a later phase. *(Trace viewer and workout review UX are done — see Phase 3 below.)*

## Phase 3 progress (shipped, local)

**Completed (accepted)**

- **AI trace viewer (dev-only)** — route `app/(panel)/dev/ai-traces` lists Dexie `aiDecisionTraces` (`listAiDecisionTraces`), row detail (exercises, load sources, calibration flags), and **Clear traces** (`clearAiDecisionTraces`). `NODE_ENV === "development"` only; production returns 404.
- **Workout review UX** — `WorkoutReviewContent` reorganized: workout summary (volume, sets, exercise count, duration), “By exercise” breakdown, **What went well** (`InsightCard` / `went_well`), **What to adjust** (`needs_attention` / `warnings`), **Next workout hint** (when `trainingSignals` from the last suggest-next is available on save), then next-session focus and key-lift notes. The **post-workout AI feedback loop** (finish session → structured review → optional bridge to the next plan via split/fatigue/volume hint) is easier to read than the old flat block.

## Current Stage

**Local AI MVP** (Phase 2 + Phase 3 local UX shipped; server Beta roadmap items remain)

Why this is not yet Beta:

- no server persistence
- no auth
- analytics are heuristic
- AI memory is still single-device (durable locally), but not cross-device / server-backed
- cross-device sync missing

## Major Technical Gaps

- **Server persistence layer** (workouts, exercises, profiles, settings)
- **Auth system** (accounts, sessions, access control)
- **Durable AI memory** (now stored locally in Dexie; remaining gap is cross-device sync / server-side memory)
- **Canonical training data model** (muscles, movement patterns, equipment, injury constraints)
- **Real analytics engine** (canonical volume + estimated strength are in place; remaining work is reducing the last legacy heuristics for orphan/old data and adding richer charts/insights)
- **Background AI processing** (queue/worker for review/insights/telemetry, retries)

## Phase 1 Progress

**Completed (accepted)**

- Canonical exercise metadata model + types (Dexie-backed)
- Dexie exercises normalized/enriched (library + metadata) and treated as canonical catalog
- Workout logging writes stable `exerciseId` and preserves old sessions safely
- AI selection payload includes canonical Dexie `exerciseCatalog`
- Analytics/progress migrated to canonical metadata (with fallback heuristics for old/orphan data)
- Durable AI Coach memory stored in Dexie (`coachMemory`), and included in suggest-next via client payload (`payload.coachMemory`); legacy `localStorage` coach memory is removed (one-time migration in `src/db/coachMemory.ts` only)
- Real analytics foundation:
  - canonical muscle volume analytics engine
  - estimated 1RM utilities
  - strength series builder (estimated 1RM over time)
  - HistoryView “Strength trend” now uses estimated 1RM series (UI unchanged)
  - training consistency analytics module (streaks, recency, days/week score)
- Decision trace logging persisted locally (dev-only):
  - Dexie `aiDecisionTraces` table stores minimal suggest-next debug traces
  - traces are written client-side after suggest-next response normalization
  - stored fields are intentionally minimal (no prompt, no full payload)

## Task 1 — Unify Exercise Catalog completed

Dexie `exercises` now acts as the canonical catalog across workout logging, AI selection payload, and analytics metadata, while preserving safe fallbacks for legacy sessions without `exerciseId`.

## Task 2 — Move AI Memory to Dexie completed

- Coach memory is now **durable and local-first** in Dexie (`coachMemory` table).
- Review flow records memory **client-side** after `/api/ai-coach/review-workout` returns (note inference + Dexie write are best-effort).
- Suggest-next receives `coachMemory` through the **client-built request payload**, and the server runtime consumes `payload.coachMemory` (no server-side storage reads).
- **Legacy localStorage coach memory** (`coAIch:coachMemory:v1`) is no longer read or written by app code; a **one-time migration** in `ensureCoachMemoryMigratedFromLocalStorage` imports into Dexie when Dexie is empty, then **removes** the legacy key. Types for memory live in `src/services/aiCoachMemory.ts` (no storage there).

## Task 3 — Real Analytics completed

- Canonical muscle volume analytics is centralized and metadata-driven (primary + secondary attribution, working sets).
- Strength estimation utilities (Epley + Brzycki) and a reusable strength series builder are in place.
- History strength trend now uses estimated 1RM series (no UI redesign).
- Consistency analytics module provides streak/recency/adherence primitives for future UI/insights.

## Task 4 — Persist AI Decision Trace completed

- Suggest-next debug traces are persisted locally in Dexie (`aiDecisionTraces`) for replay/debug across reloads.
- Persistence is **dev-only** (no production writes) and stores minimal fields (mode/source/split, calibration flags, per-exercise load sources, exercise names).

