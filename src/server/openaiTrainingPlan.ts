import { formatAthleteGoalForPlan } from "@/lib/athleteProfileLabels";
import type { GeneratePlanRequest } from "@/types/api";
import type { WorkoutTemplate } from "@/types/training";
import {
  parseAndValidateOpenAiPlanJson,
  stripJsonFence,
  type OpenAiPlanJson,
} from "@/server/openaiPlanJson";
import { buildNonWorkoutDraftActionsForOpenAi } from "@/services/planGenerator.mock";
import {
  planWorkoutExecutionItems,
  workoutExecutionMatchesTemplate,
} from "@/services/workoutPlanner";

const MODEL = "gpt-4o-mini";

function buildTrainingMessages(
  body: GeneratePlanRequest,
  tpl: WorkoutTemplate,
  baselineRows: { label: string; plannedValue: string }[],
) {
  const profile = body.athleteProfile!;
  const sessions = body.recentSessions ?? [];

  const system = `You are adjusting planned loads for Life Execution Panel — a gym execution app.

You MUST respond with a single JSON object and nothing else (no markdown, no prose).
The JSON must match this shape exactly:
{
  "summary": "short factual summary of today's plan",
  "actions": [
    {
      "type": "workout" | "run" | "reading" | "project",
      "title": "string",
      "description": "optional string",
      "goal": "optional string",
      "executionItems": [
        { "label": "string", "plannedValue": "string" }
      ]
    }
  ]
}

Hard rules:
- "actions" MUST contain between 3 and 4 items (inclusive).
- The FIRST action MUST be type "workout".
- For that first workout: use EXACTLY the same "label" strings IN THE SAME ORDER as the workout template exercises. Do NOT rename, add, remove, or reorder exercises.
- You MAY change only "plannedValue" strings vs the baseline (small adjustments). Format like "100×10" (use ×).
- Do NOT invent new exercises.
- Remaining actions are non-workout blocks; keep them concrete with executionItems.
- If phase is "post_cycle": keep loads conservative vs baseline; no big jumps.
- No motivational language.

You adjust — you do not invent the workout structure.`;

  const user = `Athlete profile:
${JSON.stringify(profile, null, 2)}

Recent training sessions (most recent first):
${JSON.stringify(sessions, null, 2)}

Workout template (structure is fixed — labels and order must match):
${JSON.stringify(tpl, null, 2)}

Baseline planned rows from local planner (adjust lightly from this, do not change labels):
${JSON.stringify(baselineRows, null, 2)}

Calendar date: ${body.date}
User settings:
${JSON.stringify(body.settings, null, 2)}

Return JSON with the first workout matching the template labels/order.`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export function parseTrainingPlanJson(
  raw: unknown,
  template: WorkoutTemplate,
): OpenAiPlanJson | null {
  const base = parseAndValidateOpenAiPlanJson(raw);
  if (!base) return null;
  const first = base.actions[0];
  if (!first || first.type !== "workout") return null;
  if (!workoutExecutionMatchesTemplate(first.executionItems, template))
    return null;
  return base;
}

/** Local-only plan shape when OpenAI is skipped or returns unusable JSON. */
export function buildLocalTrainingOpenAiPlan(
  body: GeneratePlanRequest,
  template: WorkoutTemplate,
): OpenAiPlanJson {
  const profile = body.athleteProfile!;
  const rows = planWorkoutExecutionItems(
    profile,
    body.recentSessions ?? [],
    template,
  );
  const workout = {
    type: "workout" as const,
    title: `${template.name}`,
    description: [
      profile.notes?.trim(),
      `Phase: ${profile.phase}. Template: ${template.dayType}.`,
    ]
      .filter(Boolean)
      .join(" "),
    goal: formatAthleteGoalForPlan(profile) || "Execute rows; log actuals.",
    executionItems: rows,
  };
  const fillers = buildNonWorkoutDraftActionsForOpenAi(2, body.settings);
  return {
    summary: `${template.name}: loads from recent logs + phase (${profile.phase}).`,
    actions: [workout, ...fillers],
  };
}

/**
 * Training-aware OpenAI call. On HTTP/parse failure returns a local plan from
 * workoutPlanner (template + history + profile) plus filler blocks.
 */
export async function fetchTrainingAwarePlan(
  body: GeneratePlanRequest,
  template: WorkoutTemplate,
  apiKey: string,
): Promise<OpenAiPlanJson> {
  const fallback = () => buildLocalTrainingOpenAiPlan(body, template);
  if (!body.athleteProfile) return fallback();

  const baselineRows = planWorkoutExecutionItems(
    body.athleteProfile,
    body.recentSessions ?? [],
    template,
  );

  const messages = buildTrainingMessages(body, template, baselineRows);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[generate-plan] training OpenAI HTTP error", res.status, errText);
    return fallback();
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return fallback();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    return fallback();
  }

  return parseTrainingPlanJson(parsed, template) ?? fallback();
}
