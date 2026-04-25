"use client";

import { useCallback, useEffect, useState } from "react";
import {
  filterHistoryByType,
  loadHistoryGrouped,
  type HistoryGroup,
} from "@/services/history";
import type { ActionType } from "@/types";

export function useHistory() {
  const [groups, setGroups] = useState<HistoryGroup[]>([]);
  const [filter, setFilter] = useState<ActionType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await loadHistoryGrouped();
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const filtered = filterHistoryByType(groups, filter);

  return { groups: filtered, filter, setFilter, loading, error, refresh };
}
