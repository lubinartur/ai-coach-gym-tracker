"use client";

import { useCallback, useEffect, useState } from "react";
import { getOrCreateSettings, saveSettings } from "@/db/settings";
import type { UserSettings } from "@/types";

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const row = await getOrCreateSettings();
      setSettings(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const save = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!settings) return;
      setSaving(true);
      setError(undefined);
      try {
        await saveSettings(patch);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save settings");
      } finally {
        setSaving(false);
      }
    },
    [refresh, settings],
  );

  return { settings, loading, saving, error, refresh, save };
}
