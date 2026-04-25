import type { AppLanguage } from "@/i18n/language";

export type ActionType = "workout" | "run" | "reading" | "project";

export type ActionStatus = "planned" | "done" | "partial" | "skipped";

export type LogStatus = "done" | "partial" | "skipped";

export type PlanningStyle = "light" | "normal" | "intense";

export type DailyPlan = {
  id: string;
  date: string;
  createdAt: string;
  source: "ai" | "manual";
  note?: string;
  actionIds: string[];
};

/** One concrete row inside an execution block (planned vs actual) */
export type ExecutionItem = {
  id: string;
  label: string;
  plannedValue: string;
  actualValue?: string;
};

export type Action = {
  id: string;
  planId: string;
  date: string;
  type: ActionType;
  title: string;
  description?: string;
  goal?: string;
  /**
   * Structured execution sheet rows (planned vs actual).
   * Persisted in Dexie on the action; actuals may be updated while filling the sheet.
   */
  executionItems: ExecutionItem[];
  status: ActionStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type ActionLog = {
  id: string;
  actionId: string;
  date: string;
  /** Snapshot of execution rows at log time */
  executionItems?: ExecutionItem[];
  resultText?: string;
  durationMin?: number;
  value?: number;
  unit?: string;
  energy?: 1 | 2 | 3 | 4 | 5;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  status: LogStatus;
  createdAt: string;
};

export type UserSettings = {
  id: string;
  userName?: string;
  timezone: string;
  preferredActionTypes: ActionType[];
  planningStyle: PlanningStyle;
  backendUrl?: string;
  /** Default rest countdown (seconds) after marking a set done. Default 90. */
  defaultRestSec?: number;
  /** UI language; drives i18n and AI Coach response language. */
  language?: AppLanguage;
};

/** One row for history UI: log + resolved action fields */
export type HistoryEntry = {
  log: ActionLog;
  actionTitle: string;
  actionType: ActionType;
  planNote?: string;
};
