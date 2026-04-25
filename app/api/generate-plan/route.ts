import { NextResponse } from "next/server";
import { buildPlanAndActionsFromPayload } from "@/lib/planFactory";
import type { GeneratePlanRequest, GeneratePlanResponse } from "@/types/api";
import { fetchOpenAiDailyPlan } from "@/server/openaiDailyPlan";
import { fetchTrainingAwarePlan } from "@/server/openaiTrainingPlan";
import { mockPlanPayloadForDate } from "@/services/planGenerator.mock";
import { selectTemplateForDate } from "@/services/workoutPlanner";

/**
 * POST /api/generate-plan
 *
 * Training-aware path: when workout templates + athlete profile exist and workouts
 * are preferred, OpenAI uses the template structure + recent sessions + phase rules.
 * Otherwise falls back to generic daily planning, then to local mock.
 */
export async function POST(req: Request) {
  let body: GeneratePlanRequest;
  try {
    body = (await req.json()) as GeneratePlanRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.date || !body?.settings) {
    return NextResponse.json(
      { error: "Missing required fields: date, settings" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  let planPayload: ReturnType<typeof buildPlanAndActionsFromPayload> | null =
    null;

  const workoutTpl = selectTemplateForDate(
    body.date,
    body.workoutTemplates ?? [],
  );
  const useTrainingPath =
    !!workoutTpl &&
    !!body.athleteProfile &&
    body.settings.preferredActionTypes.includes("workout");

  if (apiKey) {
    let ai =
      useTrainingPath && workoutTpl
        ? await fetchTrainingAwarePlan(body, workoutTpl, apiKey)
        : null;
    if (!ai) {
      ai = await fetchOpenAiDailyPlan(body, apiKey);
    }
    if (ai) {
      planPayload = buildPlanAndActionsFromPayload(
        body.date,
        { source: "ai", note: ai.summary },
        ai.actions.map((a) => ({
          type: a.type,
          title: a.title,
          description: a.description,
          goal: a.goal,
          status: "planned" as const,
          executionItems: a.executionItems,
        })),
      );
    }
  }

  if (!planPayload) {
    const mock = mockPlanPayloadForDate(body.date, body.settings, {
      athleteProfile: body.athleteProfile,
      workoutTemplate: workoutTpl,
      recentSessions: body.recentSessions,
    });
    planPayload = buildPlanAndActionsFromPayload(
      body.date,
      mock.plan,
      mock.actions,
    );
  }

  const res: GeneratePlanResponse = {
    plan: planPayload.plan,
    actions: planPayload.actions,
  };
  return NextResponse.json(res);
}
