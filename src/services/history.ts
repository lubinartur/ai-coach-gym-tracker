import { db } from "@/db/database";
import { listAllActionLogs, listAllActions } from "@/db/plans";
import type { ActionType, HistoryEntry } from "@/types";

export type HistoryGroup = {
  date: string;
  entries: HistoryEntry[];
};

function sortDateDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export async function loadHistoryGrouped(): Promise<HistoryGroup[]> {
  const [logs, actions] = await Promise.all([
    listAllActionLogs(),
    listAllActions(),
  ]);
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  const entries: HistoryEntry[] = [];
  for (const log of logs) {
    const action = actionMap.get(log.actionId);
    if (!action) continue;
    const plan = await db.dailyPlans.get(action.planId);
    entries.push({
      log,
      actionTitle: action.title,
      actionType: action.type,
      planNote: plan?.note,
    });
  }

  const byDate = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const d = e.log.date;
    const arr = byDate.get(d) ?? [];
    arr.push(e);
    byDate.set(d, arr);
  }

  return [...byDate.entries()]
    .sort(([da], [db]) => sortDateDesc(da, db))
    .map(([date, list]) => ({
      date,
      entries: list.sort((a, b) =>
        b.log.createdAt.localeCompare(a.log.createdAt),
      ),
    }));
}

export function filterHistoryByType(
  groups: HistoryGroup[],
  type: ActionType | "all",
): HistoryGroup[] {
  if (type === "all") return groups;
  return groups
    .map((g) => ({
      ...g,
      entries: g.entries.filter((e) => e.actionType === type),
    }))
    .filter((g) => g.entries.length > 0);
}
