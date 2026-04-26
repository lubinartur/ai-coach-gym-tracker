import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import type { TrainingAdaptationState } from "@/services/trainingAdaptationEngine";

export type TrainingCalendarSession = {
  dayOffset: number;
  split: "Push" | "Pull" | "Legs" | "Full";
  intensity: "normal" | "light" | "deload";
};

export type TrainingCalendar = {
  weekStart: number;
  plannedSessions: TrainingCalendarSession[];
};

function firstPlannedSplit(runtime: EngineRuntimeContext): TrainingCalendarSession["split"] {
  const r = runtime.decision.splitSelection?.recommendedSplit;
  if (r === "Push" || r === "Pull" || r === "Legs" || r === "Full") return r;
  const p = runtime.decision.splitContinuityGuard?.preferredNextSplits?.[0];
  if (p === "Push" || p === "Pull" || p === "Legs" || p === "Full") return p;
  return "Full";
}

function distributeSplits(first: TrainingCalendarSession["split"], count: number): TrainingCalendarSession["split"][] {
  const cycle: TrainingCalendarSession["split"][] = ["Push", "Pull", "Legs", "Full"];
  const out: TrainingCalendarSession["split"][] = [first];
  const rest = cycle.filter((s) => s !== first);
  for (let i = 1; i < count; i++) {
    out.push(rest[(i - 1) % rest.length]!);
  }
  return out;
}

function dayOffsetsFor(count: number, extraRest: boolean): number[] {
  const gap = extraRest ? 3 : 2; // “extra rest day between sessions”
  const out: number[] = [];
  let d = 0;
  for (let i = 0; i < count; i++) {
    out.push(Math.max(0, Math.min(6, d)));
    d += gap;
  }
  // If we collided at the end (clamped), de-dup by shifting forward where possible.
  const used = new Set<number>();
  for (let i = 0; i < out.length; i++) {
    let x = out[i]!;
    while (used.has(x) && x < 6) x += 1;
    out[i] = x;
    used.add(x);
  }
  return out;
}

/**
 * Build a recommended upcoming training week calendar.
 *
 * Notes:
 * - Does not replace suggest-next; it only proposes a weekly structure.
 * - Uses recovery + phase + split selection + adaptation signals to decide frequency, split distribution, and intensity.
 */
export function buildTrainingCalendar(
  runtime: EngineRuntimeContext,
  adaptation: TrainingAdaptationState,
): TrainingCalendar {
  // Rule: week start is Date.now()
  const weekStart = Date.now();

  // Rule 1: base frequency default 3 sessions.
  let sessions = 3;

  // Rule 2: fatigue high => max 2 sessions.
  if (runtime.recovery.globalFatigueLevel === "high") sessions = Math.min(sessions, 2);

  const phase = runtime.decision.trainingPhase?.phase ?? "unknown";
  const intensity: TrainingCalendarSession["intensity"] =
    phase === "deload" ? "light" : runtime.recovery.globalFatigueLevel === "high" ? "light" : "normal";

  // Rule 4: split distribution uses recommended split first.
  const first = firstPlannedSplit(runtime);
  const splits = distributeSplits(first, sessions);

  // Rule 5: adaptation fatigue accumulation => extra rest day between sessions.
  const offsets = dayOffsetsFor(sessions, Boolean(adaptation?.fatigueAccumulation));

  const plannedSessions: TrainingCalendarSession[] = splits.map((split, i) => ({
    dayOffset: offsets[i] ?? i,
    split,
    intensity,
  }));

  return { weekStart, plannedSessions };
}

