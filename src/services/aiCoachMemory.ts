import { normalizeExerciseName } from "@/lib/exerciseName";

export type CoachMemoryEntry = {
  sessionId: string;
  exercise: string;
  observation: "rep_drop" | "stagnation" | "fatigue" | "good_progress";
  decision:
    | "increase_reps"
    | "increase_weight"
    | "maintain"
    | "reduce_load"
    | "swap_exercise";
  confidence: number;
  createdAt: number; // unix ms
};

export type CoachMemoryContext = {
  /** Keyed by normalized exercise name. */
  exerciseMemories: Record<string, CoachMemoryEntry[]>;
};

const STORAGE_KEY = "coAIch:coachMemory:v1";
const MAX_ENTRIES = 2000;

// Server-side best-effort memory store (process-local). This enables memory usage in
// server runtime without changing Dexie schema yet.
let serverMemoryStore: CoachMemoryEntry[] = [];

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function loadAll(): CoachMemoryEntry[] {
  if (!isBrowser()) return [...serverMemoryStore];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Best-effort validation; drop malformed rows.
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => x as Record<string, unknown>)
      .filter((o) => typeof o.sessionId === "string" && typeof o.exercise === "string")
      .map((o) => ({
        sessionId: String(o.sessionId),
        exercise: String(o.exercise),
        observation: (o.observation as CoachMemoryEntry["observation"]) ?? "stagnation",
        decision: (o.decision as CoachMemoryEntry["decision"]) ?? "maintain",
        confidence: clampConfidence(Number(o.confidence)),
        createdAt:
          typeof o.createdAt === "number" && Number.isFinite(o.createdAt)
            ? Math.max(0, o.createdAt)
            : 0,
      }));
  } catch {
    return [];
  }
}

function saveAll(entries: CoachMemoryEntry[]) {
  if (!isBrowser()) {
    serverMemoryStore = [...entries];
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota / serialization issues
  }
}

/**
 * Record one coach decision into persistent memory.
 *
 * Storage: browser `localStorage` only (no Dexie schema changes yet).
 */
export function recordCoachDecision(entry: CoachMemoryEntry): void {
  const e: CoachMemoryEntry = {
    sessionId: String(entry.sessionId),
    exercise: String(entry.exercise).trim(),
    observation: entry.observation,
    decision: entry.decision,
    confidence: clampConfidence(entry.confidence),
    createdAt:
      typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
        ? Math.max(0, entry.createdAt)
        : Date.now(),
  };
  if (!e.sessionId || !e.exercise) return;

  const all = loadAll();
  all.push(e);
  // keep most recent entries
  if (all.length > MAX_ENTRIES) {
    all.splice(0, all.length - MAX_ENTRIES);
  }
  saveAll(all);
}

export function getRecentCoachMemory(input: {
  exercise: string;
  limit: number;
}): CoachMemoryEntry[] {
  const key = normalizeExerciseName(input.exercise);
  if (!key) return [];
  const limit = Math.max(0, Math.min(50, Math.floor(input.limit)));
  if (limit === 0) return [];

  const all = loadAll();
  const hits = all
    .filter((e) => normalizeExerciseName(e.exercise) === key)
    .sort((a, b) => b.createdAt - a.createdAt);
  return hits.slice(0, limit);
}

export function getWorkoutCoachMemory(sessionId: string): CoachMemoryEntry[] {
  const id = String(sessionId);
  if (!id) return [];
  return loadAll()
    .filter((e) => e.sessionId === id)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function buildCoachMemoryContext(input: {
  exercises: string[];
  limitPerExercise?: number;
}): CoachMemoryContext {
  const limit = Math.max(1, Math.min(20, Math.floor(input.limitPerExercise ?? 6)));
  const exerciseMemories: Record<string, CoachMemoryEntry[]> = {};

  for (const ex of input.exercises ?? []) {
    const k = normalizeExerciseName(ex);
    if (!k) continue;
    if (exerciseMemories[k]) continue;
    exerciseMemories[k] = getRecentCoachMemory({ exercise: ex, limit });
  }

  return { exerciseMemories };
}

