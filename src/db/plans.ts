import type { Action, ActionLog, DailyPlan } from "@/types";
import { db } from "./database";

export async function getPlanByDate(date: string): Promise<DailyPlan | undefined> {
  return db.dailyPlans.where("date").equals(date).first();
}

export async function getActionsForPlan(planId: string): Promise<Action[]> {
  return db.actions.where("planId").equals(planId).sortBy("order");
}

export async function getActionById(id: string): Promise<Action | undefined> {
  return db.actions.get(id);
}

/** Replace any existing plan for this calendar date with a new plan + actions */
export async function replacePlanForDate(
  date: string,
  plan: DailyPlan,
  actions: Action[],
): Promise<void> {
  const existing = await getPlanByDate(date);
  await db.transaction("rw", db.dailyPlans, db.actions, db.actionLogs, async () => {
    if (existing) {
      const oldActions = await getActionsForPlan(existing.id);
      const oldIds = oldActions.map((a) => a.id);
      if (oldIds.length) {
        await db.actionLogs.where("actionId").anyOf(oldIds).delete();
        await db.actions.bulkDelete(oldIds);
      }
      await db.dailyPlans.delete(existing.id);
    }
    await db.dailyPlans.put(plan);
    await db.actions.bulkPut(actions);
  });
}

export async function upsertAction(action: Action): Promise<void> {
  await db.actions.put(action);
}

export async function putActionLog(log: ActionLog): Promise<void> {
  await db.actionLogs.put(log);
}

export async function listAllActionLogs(): Promise<ActionLog[]> {
  return db.actionLogs.toArray();
}

export async function listAllActions(): Promise<Action[]> {
  return db.actions.toArray();
}
