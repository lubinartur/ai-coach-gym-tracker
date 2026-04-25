import { createId } from "@/lib/id";
import type { Action, ActionType, DailyPlan, ExecutionItem } from "@/types";

/** Incoming row without guaranteed id (API / mock / migration) */
export type IncomingExecutionItem = {
  id?: string;
  label: string;
  plannedValue: string;
  actualValue?: string;
};

function defaultExecutionRows(
  type: ActionType,
  title: string,
): IncomingExecutionItem[] {
  switch (type) {
    case "reading":
      return [{ label: "Pages", plannedValue: "20" }];
    case "run":
      return [{ label: "Duration", plannedValue: "20 min" }];
    case "project":
      return [
        {
          label: "Task",
          plannedValue:
            title.length > 48 ? `${title.slice(0, 45)}…` : `${title} — focus block`,
        },
      ];
    case "workout":
    default:
      return [{ label: "Main set", plannedValue: "Per description" }];
  }
}

export function normalizeExecutionItems(
  rows: IncomingExecutionItem[] | undefined,
  type: ActionType,
  title: string,
): ExecutionItem[] {
  const source =
    rows && rows.length > 0 ? rows : defaultExecutionRows(type, title);
  return source.map((row) => ({
    id: row.id && String(row.id).trim() ? String(row.id) : createId(),
    label: String(row.label ?? "").trim() || "Row",
    plannedValue: String(row.plannedValue ?? "").trim() || "—",
    actualValue: row.actualValue?.trim() || undefined,
  }));
}

export type DraftActionInput = Omit<
  Action,
  | "id"
  | "planId"
  | "date"
  | "createdAt"
  | "updatedAt"
  | "order"
  | "executionItems"
> & { executionItems?: IncomingExecutionItem[] };

export function buildPlanAndActionsFromPayload(
  date: string,
  partialPlan: Omit<DailyPlan, "id" | "actionIds" | "createdAt" | "date"> & {
    id?: string;
    actionIds?: string[];
    createdAt?: string;
  },
  incomingActions: DraftActionInput[],
): { plan: DailyPlan; actions: Action[] } {
  const planId = partialPlan.id ?? createId();
  const now = new Date().toISOString();
  const actionIds: string[] = [];
  const actions: Action[] = incomingActions.map((a, index) => {
    const id = createId();
    actionIds.push(id);
    return {
      ...a,
      id,
      planId,
      date,
      order: index,
      status: a.status ?? "planned",
      executionItems: normalizeExecutionItems(a.executionItems, a.type, a.title),
      createdAt: now,
      updatedAt: now,
    };
  });
  const plan: DailyPlan = {
    id: planId,
    date,
    createdAt: partialPlan.createdAt ?? now,
    source: partialPlan.source,
    note: partialPlan.note,
    actionIds,
  };
  return { plan, actions };
}
