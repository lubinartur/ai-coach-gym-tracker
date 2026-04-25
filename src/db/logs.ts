import { db } from "./database";

export async function getLatestLogForAction(
  actionId: string,
): Promise<import("@/types").ActionLog | undefined> {
  const logs = await db.actionLogs.where("actionId").equals(actionId).toArray();
  if (!logs.length) return undefined;
  return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
