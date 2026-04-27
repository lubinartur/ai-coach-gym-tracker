/**
 * Coach memory **types** for AI runtime and Dexie.
 *
 * Persistence: `src/db/coachMemory.ts` (Dexie `coachMemory` table). The client
 * passes `payload.coachMemory` into suggest-next; there is no localStorage source.
 */

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
