import { db } from "@/db/database";
import type { TrainingSession } from "@/types/training";

/** Last N logged workout sessions (from workout-type action logs with execution rows). */
export async function collectRecentWorkoutSessions(
  limit = 5,
): Promise<TrainingSession[]> {
  const logs = await db.actionLogs.orderBy("createdAt").reverse().toArray();
  const actions = await db.actions.toArray();
  const actionById = new Map(actions.map((a) => [a.id, a]));

  const sessions: TrainingSession[] = [];
  for (const log of logs) {
    if (sessions.length >= limit) break;
    const action = actionById.get(log.actionId);
    if (!action || action.type !== "workout") continue;
    if (!log.executionItems?.length) continue;

    sessions.push({
      date: log.date,
      exercises: log.executionItems.map((e) => ({
        label: e.label,
        plannedValue: e.plannedValue,
        actualValue: e.actualValue,
      })),
      energy: log.energy,
      notes: log.resultText,
    });
  }
  return sessions;
}
