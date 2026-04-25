import { getOrCreateAthleteProfile } from "@/db/athleteProfile";
import { replacePlanForDate } from "@/db/plans";
import { getOrCreateSettings } from "@/db/settings";
import {
  ensureSeedWorkoutTemplates,
  listWorkoutTemplates,
} from "@/db/workoutTemplates";
import { getCalendarDateInTimezone } from "@/lib/dates";
import { buildPlanAndActionsFromPayload } from "@/lib/planFactory";
import type { Action, DailyPlan, UserSettings } from "@/types";
import type { GeneratePlanRequest, GeneratePlanResponse } from "@/types/api";
import { mockPlanPayloadForDate } from "./planGenerator.mock";
import { buildHistorySummary } from "./summary";
import { buildStrengthProfile } from "./strengthProfile";
import { collectRecentWorkoutSessions } from "./trainingSessions";
import { selectTemplateForDate } from "@/services/workoutPlanner";

function resolveGenerateUrl(settings: UserSettings): string {
  const raw = settings.backendUrl?.trim();
  if (!raw) return "/api/generate-plan";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return `${raw.replace(/\/$/, "")}/api/generate-plan`;
  }
  return "/api/generate-plan";
}

async function tryRemoteGenerate(
  url: string,
  body: GeneratePlanRequest,
): Promise<GeneratePlanResponse | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GeneratePlanResponse;
    if (!data?.plan || !Array.isArray(data.actions)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Force local IDs even if a server returned placeholder ids */
function normalizeToLocalIds(
  date: string,
  res: GeneratePlanResponse,
): { plan: DailyPlan; actions: Action[] } {
  const draftActions = res.actions.map((a) => ({
    type: a.type,
    title: a.title,
    description: a.description,
    goal: a.goal,
    status: (a.status ?? "planned") as Action["status"],
    executionItems: a.executionItems?.map((row) => ({
      label: row.label,
      plannedValue: row.plannedValue,
      actualValue: row.actualValue,
    })),
  }));
  return buildPlanAndActionsFromPayload(
    date,
    {
      source: res.plan.source,
      note: res.plan.note,
    },
    draftActions,
  );
}

/**
 * Orchestrates plan creation: calls backend (or Next route), falls back to mock.
 * Sends athlete profile, workout templates, and recent workout sessions for training-aware generation.
 */
export async function generateTodayPlan(): Promise<void> {
  await ensureSeedWorkoutTemplates();

  const settings = await getOrCreateSettings();
  const date = getCalendarDateInTimezone(new Date(), settings.timezone);
  const historySummary = await buildHistorySummary();
  const athleteProfile = await getOrCreateAthleteProfile();
  const workoutTemplates = await listWorkoutTemplates();
  const recentSessions = await collectRecentWorkoutSessions(5);
  const strengthProfile = await buildStrengthProfile();

  const body: GeneratePlanRequest = {
    date,
    settings,
    historySummary,
    athleteProfile,
    workoutTemplates,
    recentSessions,
    strengthProfile,
  };

  const url = resolveGenerateUrl(settings);
  const remote = await tryRemoteGenerate(url, body);

  let normalized: { plan: DailyPlan; actions: Action[] };
  if (remote) {
    normalized = normalizeToLocalIds(date, remote);
  } else {
    const tpl = selectTemplateForDate(date, workoutTemplates);
    const mock = mockPlanPayloadForDate(date, settings, {
      athleteProfile,
      workoutTemplate: tpl,
      recentSessions,
    });
    normalized = buildPlanAndActionsFromPayload(date, mock.plan, mock.actions);
  }

  await replacePlanForDate(date, normalized.plan, normalized.actions);
}
