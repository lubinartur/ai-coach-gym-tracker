"use client";

import { useCallback, useEffect, useState } from "react";
import { getActionsForPlan, getPlanByDate } from "@/db/plans";
import { getOrCreateSettings } from "@/db/settings";
import { getCalendarDateInTimezone } from "@/lib/dates";
import { generateTodayPlan } from "@/services/backend";
import type { Action, DailyPlan } from "@/types";

export type TodayState = {
  date: string;
  plan?: DailyPlan;
  actions: Action[];
  loading: boolean;
  generating: boolean;
  error?: string;
};

export function useTodayPlan() {
  const [state, setState] = useState<TodayState>({
    date: "",
    actions: [],
    loading: true,
    generating: false,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const settings = await getOrCreateSettings();
      const date = getCalendarDateInTimezone(new Date(), settings.timezone);
      const plan = await getPlanByDate(date);
      const actions = plan ? await getActionsForPlan(plan.id) : [];
      setState({
        date,
        plan,
        actions,
        loading: false,
        generating: false,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        generating: false,
        error: e instanceof Error ? e.message : "Failed to load today",
      }));
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const generate = useCallback(async () => {
    setState((s) => ({ ...s, generating: true, error: undefined }));
    try {
      await generateTodayPlan();
      await refresh();
    } catch (e) {
      setState((s) => ({
        ...s,
        generating: false,
        error: e instanceof Error ? e.message : "Could not generate plan",
      }));
    }
  }, [refresh]);

  return { ...state, refresh, generate };
}
