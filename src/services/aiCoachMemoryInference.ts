import type { CoachMemoryEntry } from "@/services/aiCoachMemory";

export function inferCoachMemoryFromNote(
  note: string,
): Pick<CoachMemoryEntry, "observation" | "decision" | "confidence"> | null {
  const s = String(note ?? "").toLowerCase();
  if (!s.trim()) return null;

  // Stagnation / swap
  if (/(stall|stagnat|stuck|plateau|swap|variation|стагнац|плато|застрял|вариац|смен)/i.test(s)) {
    return { observation: "stagnation", decision: "swap_exercise", confidence: 64 };
  }
  // Rep drop / maintain
  if (/(rep drop|dropped reps|fell off|срыв повтор|упал.*повтор|падение повтор)/i.test(s)) {
    return { observation: "rep_drop", decision: "maintain", confidence: 58 };
  }
  // Fatigue / reduce load
  if (/(fatigue|tired|exhaust|deload|recover|устал|утом|восстанов|делоад|разгруз)/i.test(s)) {
    return { observation: "fatigue", decision: "reduce_load", confidence: 60 };
  }
  // Good progress / increase weight
  if (/(good|strong|solid|progress|improv|nice|отлично|сильно|прогресс|улучш)/i.test(s)) {
    return { observation: "good_progress", decision: "increase_weight", confidence: 62 };
  }

  return null;
}

