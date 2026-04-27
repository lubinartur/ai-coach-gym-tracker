# CoAIch Product Roadmap v2

This roadmap is based on the **real current state** of the repository (local-first Next.js + Dexie, AI coach endpoints under `app/api`, training engines under `src/services`/`src/lib`).

## Phase 1 — Stabilize Local MVP

**Goals**

Make the existing local-first system technically solid and internally consistent.

**Tasks**

- [x] Create canonical exercise metadata model
  - [x] muscles
  - [x] movement patterns
  - [x] equipment
  - [x] injury constraints
- [-] Remove regex-based analytics (replace with metadata-driven attribution)
  - Partially done: metadata-first analytics are in place, but legacy/orphan session data still uses name/regex fallbacks in a few spots.
- [x] Implement real muscle volume calculations (metadata-driven, consistent across UI + AI payload)
  - Canonical muscle volume analytics engine exists and is integrated for weekly volume + history windows (working sets, primary+secondary attribution).
- [x] Add 1RM estimation (and/or rep-max estimates) for strength trend charts
  - Estimated 1RM utilities + strength series builder (estimated 1RM over time) are implemented.
- [x] Consistency analytics (streaks, recency, target days/week scoring)
- [x] Normalize exercise catalog with Dexie DB (ensure AI selection uses the same canonical exercise store)
- [x] Move AI memory to Dexie
  - [x] add schema + migrations in `src/db/database.ts`
  - [x] store coach memory in Dexie (`coachMemory`) and include it in suggest-next via client payload (`payload.coachMemory`)
  - [x] legacy localStorage memory cleanup (one-time migrate into Dexie when empty, then remove legacy key; `src/services/aiCoachMemory.ts` is types-only)
- [x] Improve decision trace logging
  - [x] keep traces consistently attached to outputs in dev
  - [x] persist traces locally for debugging/replay (dev-only; minimal stored fields)
- [x] **Post-generation progression safety (suggest-next, history-based path)**
  - [x] After the LLM returns, **post-process** prescribed sets/loads in `applySuggestNextProgressionGuards` (see `src/server/aiCoach/suggestNext/progressionGuards.ts`) — no change to prompts.
  - [x] **Validate** output against `progressionPlan` (e.g. no **weight** increase when plan is **increase_reps**; **maintain** / **reduce_*** caps; high fatigue downgrades **increase_weight** / **increase_sets** to **maintain** for validation).
  - [x] **Rate-limit** consecutive weight jumps using `exerciseHistory` `recent` top weights.
  - [x] **Cap extra working sets** when weekly muscle volume is at/above max (metadata + `musclesAtWeeklyVolumeMax`).
  - [x] **Warnings** on the response; **`aiDebug.progressionGuards`** for the full list (dev / inspection).

**Follow-ups (keep as follow-up work)**

- [-] Reduce remaining regex/name fallbacks used for orphan/legacy data where metadata is missing
- [x] Legacy localStorage cleanup (coach memory): completed; active source is Dexie → `payload.coachMemory` only
- [ ] **Extend progression guards** to **coach_recommended** and **template / fallback** suggest-next paths (parity with history-based post-LLM guards) **if product needs it** — today guards run only inside `finalizeResponse` for the OpenAI history-based flow; see `docs/project-status.md` → *Progression safety (suggest-next)*.

**Outcome**

Stable local AI training system with consistent exercise metadata, reliable local memory, analytics that reflect real training structure (not regex heuristics), and **safety rails on history-based suggest-next** so aggressive LLM load/volume is corrected after generation.

## Phase 2 — Product UX & Analytics

**Tasks**

- [x] Redesign AI Coach result card (suggested session, rationale, training signals, per-exercise notes, CTA) — *dashboard-wide visual polish remains a follow-up*
- [x] Improve Progress / History screen (hierarchy, consistency, weekly load, strength, totals; engine-backed where available)
- [x] Exercise Progress view (per-lift / per-exercise strength series + session table from `buildStrengthSeries`)
- [x] Progress: canonical muscle volume block (7-day working sets by muscle, vs prior week, trends)
- [x] AI Coach explainability (split reason, load source lines, baseline “last time”) — *UI only; uses existing response fields*
- [~] Rich progress charts (dedicated time-series / charting library) — *partial: sparklines + bars on History; full chart suite not built*
- [~] Volume graphs (weekly/monthly per muscle) — *partial: muscle volume section + weekly bars; not a full graph dashboard*

**Follow-ups (Phase 2 or near-term)**

- [ ] Polish AI Coach dashboard **visual design** (spacing, hierarchy, non-result surfaces)
- [x] **Trace viewer UI** — *done: dev route `/dev/ai-traces` (table + detail + clear; see Phase 3 below)*
- [x] **Workout review UX** — *done: `WorkoutReviewContent` sections + next-hint; see Phase 3 below*
- [ ] **Optional / later phase:** long-term **training plan engine** (multi-week block periodization) — not committed to Phase 2

**Outcome**

User can clearly see progress and training insights, and understand why the coach recommends a given session. Core engine-backed Progress views and coach explainability shipped; polish and deeper charting remain.

## Phase 3 (local) — Shipped: trace viewer + review UX

*Local-only developer tool and post-workout presentation; not server Beta infrastructure.*

- [x] **AI trace viewer (development)** — Inspect `aiDecisionTraces` in Dexie (list, detail, clear). Route is **dev-only** (404 in production).
- [x] **Workout review UX** — Clear sections: summary metrics, what went well / what to adjust, next-workout hint when training signals are available, next-session focus. The **post-workout AI feedback loop** is **clearer** (athlete sees score → structured positives/adjustments → how the next session may lean before asking for a new plan).

## Phase 4 — Beta Infrastructure

**Tasks**

- Add authentication
- Add server database
- Implement sync layer
- Persist workouts server-side
- Move AI memory server-side
- Add background queue for AI review (and insight generation) with retries
- Add telemetry for AI outputs (success/failure, JSON validity, guard retries, latency)

**Outcome**

Multi-device AI coaching system with durable data, background processing, and operational visibility.

## Phase 5 — Closed Beta

**Goals**

- Launch with 20–50 test users
- Collect training data
- Evaluate AI suggestions
- Improve exercise rotation
- Tune progression algorithms (deterministic engines + post-LLM progression guards; optional extension to non–history-based suggest-next paths)

**Outcome**

Production-ready AI training engine, validated on real user behavior and training outcomes.

