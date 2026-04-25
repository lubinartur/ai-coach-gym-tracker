import { listAllActionLogs, listAllActions } from "@/db/plans";
import type { GeneratePlanRequest } from "@/types/api";

/** Compact history for POST /api/generate-plan — extend for real model context */
export async function buildHistorySummary(
  limitDays = 7,
): Promise<NonNullable<GeneratePlanRequest["historySummary"]>> {
  const [logs, actions] = await Promise.all([
    listAllActionLogs(),
    listAllActions(),
  ]);
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  const byDate = new Map<
    string,
    { title: string; type: string; status: string; resultText?: string }[]
  >();

  for (const log of logs) {
    const action = actionMap.get(log.actionId);
    if (!action) continue;
    const list = byDate.get(log.date) ?? [];
    list.push({
      title: action.title,
      type: action.type,
      status: log.status,
      resultText: log.resultText,
    });
    byDate.set(log.date, list);
  }

  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  const sliced = dates.slice(0, limitDays);

  return sliced.map((date) => ({
    date,
    entries: byDate.get(date) ?? [],
  }));
}
