import type { IncomingExecutionItem } from "@/lib/planFactory";
import type { ActionType } from "@/types";

export type OpenAiPlanJson = {
  summary: string;
  actions: {
    type: ActionType;
    title: string;
    description?: string;
    goal?: string;
    executionItems: { label: string; plannedValue: string }[];
  }[];
};

const ACTION_TYPES: ActionType[] = ["workout", "run", "reading", "project"];

function isActionType(v: unknown): v is ActionType {
  return typeof v === "string" && (ACTION_TYPES as string[]).includes(v);
}

const MAX_EXECUTION_ROWS = 16;

function validateExecutionItems(raw: unknown): IncomingExecutionItem[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 1 || raw.length > MAX_EXECUTION_ROWS) return null;
  const out: IncomingExecutionItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (typeof r.label !== "string" || !r.label.trim()) return null;
    if (typeof r.plannedValue !== "string" || !r.plannedValue.trim()) return null;
    out.push({
      label: r.label.trim(),
      plannedValue: r.plannedValue.trim(),
    });
  }
  return out;
}

/** Parse and validate model output; returns null if invalid */
export function parseAndValidateOpenAiPlanJson(
  raw: unknown,
): OpenAiPlanJson | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.summary !== "string" || !o.summary.trim()) return null;
  if (!Array.isArray(o.actions)) return null;
  if (o.actions.length < 3 || o.actions.length > 4) return null;

  const actions: OpenAiPlanJson["actions"] = [];
  for (const item of o.actions) {
    if (!item || typeof item !== "object") return null;
    const a = item as Record<string, unknown>;
    if (!isActionType(a.type)) return null;
    if (typeof a.title !== "string" || !a.title.trim()) return null;
    if (
      a.description !== undefined &&
      a.description !== null &&
      typeof a.description !== "string"
    ) {
      return null;
    }
    if (a.goal !== undefined && a.goal !== null && typeof a.goal !== "string") {
      return null;
    }
    const executionItems = validateExecutionItems(a.executionItems);
    if (!executionItems) return null;

    actions.push({
      type: a.type,
      title: a.title.trim(),
      description:
        typeof a.description === "string" && a.description.trim()
          ? a.description.trim()
          : undefined,
      goal:
        typeof a.goal === "string" && a.goal.trim() ? a.goal.trim() : undefined,
      executionItems,
    });
  }

  return { summary: o.summary.trim(), actions };
}

export function stripJsonFence(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return t;
}
