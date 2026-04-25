"use client";

import { useCallback, useEffect, useState } from "react";
import { getActionById } from "@/db/plans";
import { getLatestLogForAction } from "@/db/logs";
import type { Action, ActionLog } from "@/types";

export function useActionDetail(id: string | undefined) {
  const [action, setAction] = useState<Action | null>(null);
  const [latestLog, setLatestLog] = useState<ActionLog | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    if (!id) {
      setAction(null);
      setLatestLog(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const row = await getActionById(id);
      if (!row) {
        setAction(null);
        setLatestLog(undefined);
        setError("Action not found");
      } else {
        setAction(row);
        setLatestLog(await getLatestLogForAction(row.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load action");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  return { action, latestLog, loading, error, refresh };
}
