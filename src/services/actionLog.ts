import { createId } from "@/lib/id";
import { putActionLog, upsertAction } from "@/db/plans";
import type { Action, ActionLog, ExecutionItem, LogStatus } from "@/types";
import { db } from "@/db/database";

export type LogDraft = {
  status: LogStatus;
  executionItems: ExecutionItem[];
  resultText?: string;
  durationMin?: number;
  value?: number;
  unit?: string;
  energy?: 1 | 2 | 3 | 4 | 5;
  difficulty?: 1 | 2 | 3 | 4 | 5;
};

function cloneExecutionSnapshot(items: ExecutionItem[]): ExecutionItem[] {
  return items.map((row) => ({
    id: row.id,
    label: row.label,
    plannedValue: row.plannedValue,
    actualValue: row.actualValue?.trim() || undefined,
  }));
}

/** Save row actuals on the action only (no log). Used while filling the execution sheet. */
export async function persistExecutionActuals(
  action: Action,
  executionItems: ExecutionItem[],
): Promise<void> {
  const now = new Date().toISOString();
  await upsertAction({
    ...action,
    executionItems: cloneExecutionSnapshot(executionItems),
    updatedAt: now,
  });
}

/** Persist execution rows on the action, snapshot them on the log, and advance status */
export async function saveActionLogAndStatus(
  action: Action,
  draft: LogDraft,
): Promise<void> {
  const now = new Date().toISOString();
  const executionSnapshot = cloneExecutionSnapshot(draft.executionItems);
  const log: ActionLog = {
    id: createId(),
    actionId: action.id,
    date: action.date,
    executionItems: executionSnapshot,
    status: draft.status,
    resultText: draft.resultText?.trim() || undefined,
    durationMin:
      typeof draft.durationMin === "number" && !Number.isNaN(draft.durationMin)
        ? draft.durationMin
        : undefined,
    value:
      typeof draft.value === "number" && !Number.isNaN(draft.value)
        ? draft.value
        : undefined,
    unit: draft.unit?.trim() || undefined,
    energy: draft.energy,
    difficulty: draft.difficulty,
    createdAt: now,
  };

  await db.transaction("rw", db.actionLogs, db.actions, async () => {
    await putActionLog(log);
    await upsertAction({
      ...action,
      executionItems: executionSnapshot,
      status: draft.status,
      updatedAt: now,
    });
  });
}
