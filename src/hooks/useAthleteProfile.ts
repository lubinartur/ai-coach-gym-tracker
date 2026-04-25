"use client";

import { useCallback, useEffect, useState } from "react";
import { getOrCreateAthleteProfile, saveAthleteProfile } from "@/db/athleteProfile";
import type { AthleteProfile } from "@/types/athleteProfile";
export function useAthleteProfile() {
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const row = await getOrCreateAthleteProfile();
      setProfile(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load training context");
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
    async (patch: Partial<Omit<AthleteProfile, "id" | "createdAt">>) => {
      setSaving(true);
      setError(undefined);
      try {
        await saveAthleteProfile({
          ...patch,
          offCycleDate: patch.offCycleDate?.trim() || undefined,
          notes: patch.notes?.trim() || undefined,
        });
        await refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not save training context",
        );
      } finally {
        setSaving(false);
      }
    },
    [refresh],
  );

  return { profile, loading, saving, error, refresh, save };
}
