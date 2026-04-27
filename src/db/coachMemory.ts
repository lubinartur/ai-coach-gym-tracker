import Dexie from "dexie";
import { createId } from "@/lib/id";
import { normalizeExerciseName } from "@/lib/exerciseName";
import { db } from "@/db/database";
import type {
  CoachMemoryContext,
  CoachMemoryEntry,
} from "@/services/aiCoachMemory";

const LEGACY_STORAGE_KEY = "coAIch:coachMemory:v1";
const MIGRATION_FLAG_KEY = "coAIch:coachMemory:migratedToDexie:v1";

const OBSERVATIONS = new Set<CoachMemoryEntry["observation"]>([
  "rep_drop",
  "stagnation",
  "fatigue",
  "good_progress",
]);

const DECISIONS = new Set<CoachMemoryEntry["decision"]>([
  "increase_reps",
  "increase_weight",
  "maintain",
  "reduce_load",
  "swap_exercise",
]);

export type CoachMemoryRow = {
  id: string;
  createdAt: number; // unix ms
  sessionId: string;
  exerciseId?: string;
  exerciseName: string;
  normalizedExerciseName: string;
  observation: CoachMemoryEntry["observation"];
  decision: CoachMemoryEntry["decision"];
  confidence: number; // 0..100
  source: "review_inferred" | "import_localStorage_v1";
  schemaVersion: 1;
};

export type CoachMemoryInsert = Omit<CoachMemoryRow, "id"> & {
  id?: string;
};

function isBrowserDb(): boolean {
  return typeof window !== "undefined";
}

function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function clampConfidence(n: unknown): number {
  const x = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(100, x));
}

function safeNormalizedExerciseName(exerciseName: string): string | null {
  const k = normalizeExerciseName(exerciseName);
  if (k && k.trim()) return k.trim();
  const t = String(exerciseName ?? "").trim().toLowerCase();
  return t ? t : null;
}

function toEntry(row: CoachMemoryRow): CoachMemoryEntry {
  return {
    sessionId: row.sessionId,
    exercise: row.exerciseName,
    observation: row.observation,
    decision: row.decision,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

async function resolveExerciseIdBestEffort(normalizedExerciseName: string): Promise<string | undefined> {
  const k = String(normalizedExerciseName ?? "").trim();
  if (!k) return undefined;
  try {
    const row = await db.exercises.where("normalizedName").equals(k).first();
    return row?.id?.trim() ? row.id.trim() : undefined;
  } catch {
    return undefined;
  }
}

export async function addCoachMemoryEntry(input: CoachMemoryInsert): Promise<void> {
  if (!isBrowserDb()) {
    throw new Error("addCoachMemoryEntry: must be called in the browser");
  }
  const exerciseName = String(input.exerciseName ?? "").trim();
  const sessionId = String(input.sessionId ?? "").trim();
  const normalizedExerciseName =
    String(input.normalizedExerciseName ?? "").trim() ||
    safeNormalizedExerciseName(exerciseName) ||
    "exercise";

  if (!exerciseName || !sessionId) return;

  const row: CoachMemoryRow = {
    id: input.id?.trim() || createId(),
    createdAt:
      typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
        ? Math.max(0, input.createdAt)
        : Date.now(),
    sessionId,
    exerciseId: input.exerciseId?.trim() || undefined,
    exerciseName,
    normalizedExerciseName,
    observation: input.observation,
    decision: input.decision,
    confidence: clampConfidence(input.confidence),
    source: input.source,
    schemaVersion: 1,
  };
  await db.coachMemory.put(row);
}

export async function addCoachMemoryEntries(inputs: CoachMemoryInsert[]): Promise<void> {
  if (!isBrowserDb()) {
    throw new Error("addCoachMemoryEntries: must be called in the browser");
  }
  if (!Array.isArray(inputs) || inputs.length === 0) return;
  const rows: CoachMemoryRow[] = [];
  for (const input of inputs) {
    const exerciseName = String(input.exerciseName ?? "").trim();
    const sessionId = String(input.sessionId ?? "").trim();
    if (!exerciseName || !sessionId) continue;
    const normalizedExerciseName =
      String(input.normalizedExerciseName ?? "").trim() ||
      safeNormalizedExerciseName(exerciseName) ||
      "exercise";
    rows.push({
      id: input.id?.trim() || createId(),
      createdAt:
        typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
          ? Math.max(0, input.createdAt)
          : Date.now(),
      sessionId,
      exerciseId: input.exerciseId?.trim() || undefined,
      exerciseName,
      normalizedExerciseName,
      observation: input.observation,
      decision: input.decision,
      confidence: clampConfidence(input.confidence),
      source: input.source,
      schemaVersion: 1,
    });
  }
  if (rows.length === 0) return;
  await db.coachMemory.bulkPut(rows);
}

export async function listRecentCoachMemoryForExercise(input: {
  exerciseId?: string;
  exerciseName: string;
  limit: number;
}): Promise<CoachMemoryRow[]> {
  if (!isBrowserDb()) return [];
  const limit = Math.max(0, Math.min(50, Math.floor(input.limit)));
  if (limit === 0) return [];

  const exerciseId = input.exerciseId?.trim() || undefined;
  if (exerciseId) {
    return db.coachMemory
      .where("[exerciseId+createdAt]")
      .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
  }

  const k = safeNormalizedExerciseName(input.exerciseName);
  if (!k) return [];
  return db.coachMemory
    .where("[normalizedExerciseName+createdAt]")
    .between([k, Dexie.minKey], [k, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
}

export async function listCoachMemoryForSession(sessionId: string): Promise<CoachMemoryRow[]> {
  if (!isBrowserDb()) return [];
  const id = String(sessionId ?? "").trim();
  if (!id) return [];
  return db.coachMemory
    .where("[sessionId+createdAt]")
    .between([id, Dexie.minKey], [id, Dexie.maxKey])
    .sortBy("createdAt");
}

export async function buildCoachMemoryContextFromDexie(input: {
  exercises: Array<string | { exerciseId?: string; name: string }>;
  limitPerExercise?: number;
}): Promise<CoachMemoryContext> {
  const limit = Math.max(1, Math.min(20, Math.floor(input.limitPerExercise ?? 6)));
  const exerciseMemories: Record<string, CoachMemoryEntry[]> = {};
  if (!isBrowserDb()) return { exerciseMemories };

  const seen = new Set<string>();
  const exercises = Array.isArray(input.exercises) ? input.exercises : [];
  for (const ex of exercises) {
    const name = typeof ex === "string" ? ex : ex?.name;
    const exerciseId = typeof ex === "string" ? undefined : ex?.exerciseId;
    const k = safeNormalizedExerciseName(String(name ?? ""));
    if (!k || seen.has(k)) continue;
    seen.add(k);

    const rows = await listRecentCoachMemoryForExercise({
      exerciseId,
      exerciseName: String(name ?? ""),
      limit,
    });
    exerciseMemories[k] = rows.map(toEntry);
  }
  return { exerciseMemories };
}

function setMigrationDoneFlag(): void {
  try {
    window.localStorage.setItem(MIGRATION_FLAG_KEY, "1");
  } catch {
    // ignore
  }
}

function removeLegacyBlob(): void {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function migrateCoachMemoryFromLocalStorageV1(): Promise<{
  imported: number;
  skipped: number;
  alreadyMigrated: boolean;
}> {
  if (!isBrowserDb() || !hasLocalStorage()) {
    return { imported: 0, skipped: 0, alreadyMigrated: false };
  }

  let dexieCount = 0;
  try {
    dexieCount = await db.coachMemory.count();
  } catch {
    return { imported: 0, skipped: 0, alreadyMigrated: false };
  }

  // Already ran migration: drop legacy key if it still exists (old builds kept the blob).
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG_KEY) === "1") {
      removeLegacyBlob();
      return { imported: 0, skipped: 0, alreadyMigrated: true };
    }
  } catch {
    return { imported: 0, skipped: 0, alreadyMigrated: false };
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return { imported: 0, skipped: 0, alreadyMigrated: false };
  }

  if (!raw) {
    setMigrationDoneFlag();
    return { imported: 0, skipped: 0, alreadyMigrated: true };
  }

  // Legacy data present but Dexie already has memory: do not import (avoid duplicates); remove legacy.
  if (dexieCount > 0) {
    removeLegacyBlob();
    setMigrationDoneFlag();
    return { imported: 0, skipped: 0, alreadyMigrated: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { imported: 0, skipped: 0, alreadyMigrated: false };
  }
  if (!Array.isArray(parsed)) {
    removeLegacyBlob();
    setMigrationDoneFlag();
    return { imported: 0, skipped: 0, alreadyMigrated: true };
  }

  let imported = 0;
  let skipped = 0;
  const rows: CoachMemoryRow[] = [];

  for (const x of parsed) {
    if (!x || typeof x !== "object") {
      skipped += 1;
      continue;
    }
    const o = x as Record<string, unknown>;
    const sessionId = typeof o.sessionId === "string" ? o.sessionId.trim() : "";
    const exerciseName = typeof o.exercise === "string" ? o.exercise.trim() : "";
    const observation = o.observation as CoachMemoryEntry["observation"];
    const decision = o.decision as CoachMemoryEntry["decision"];
    const createdAt =
      typeof o.createdAt === "number" && Number.isFinite(o.createdAt)
        ? Math.max(0, o.createdAt)
        : 0;
    const confidence = clampConfidence(o.confidence);

    if (!sessionId || !exerciseName) {
      skipped += 1;
      continue;
    }
    if (!OBSERVATIONS.has(observation) || !DECISIONS.has(decision)) {
      skipped += 1;
      continue;
    }

    const normalizedExerciseName =
      safeNormalizedExerciseName(exerciseName) ?? "";
    if (!normalizedExerciseName) {
      skipped += 1;
      continue;
    }

    const exerciseId = await resolveExerciseIdBestEffort(normalizedExerciseName);

    rows.push({
      id: createId(),
      createdAt: createdAt || Date.now(),
      sessionId,
      exerciseId,
      exerciseName,
      normalizedExerciseName,
      observation,
      decision,
      confidence,
      source: "import_localStorage_v1",
      schemaVersion: 1,
    });
  }

  try {
    if (rows.length) {
      await db.coachMemory.bulkPut(rows);
      imported = rows.length;
    }
    // Successful import, empty import, or nothing valid: drop legacy key so Dexie is sole source.
    removeLegacyBlob();
    setMigrationDoneFlag();
  } catch {
    return { imported: 0, skipped: skipped + imported, alreadyMigrated: false };
  }

  return { imported, skipped, alreadyMigrated: false };
}

export async function ensureCoachMemoryMigratedFromLocalStorage(): Promise<void> {
  try {
    await migrateCoachMemoryFromLocalStorageV1();
  } catch {
    // best-effort only
  }
}

