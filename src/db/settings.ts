import { db, SETTINGS_SINGLE_ID } from "./database";
import { getDefaultTimezone } from "@/lib/dates";
import type { UserSettings } from "@/types";

const defaultSettings = (): UserSettings => ({
  id: SETTINGS_SINGLE_ID,
  timezone: getDefaultTimezone(),
  preferredActionTypes: ["workout", "run", "reading", "project"],
  planningStyle: "normal",
  defaultRestSec: 90,
  language: "en",
});

export async function getOrCreateSettings(): Promise<UserSettings> {
  const existing = await db.userSettings.get(SETTINGS_SINGLE_ID);
  if (existing) return existing;
  const row = defaultSettings();
  await db.userSettings.put(row);
  return row;
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
  const current = await getOrCreateSettings();
  await db.userSettings.put({
    ...current,
    ...patch,
    id: SETTINGS_SINGLE_ID,
  });
}
