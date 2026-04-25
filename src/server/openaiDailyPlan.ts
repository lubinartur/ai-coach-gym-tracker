import type { GeneratePlanRequest } from "@/types/api";
import {
  parseAndValidateOpenAiPlanJson,
  stripJsonFence,
  type OpenAiPlanJson,
} from "@/server/openaiPlanJson";

export type { OpenAiPlanJson };

const MODEL = "gpt-4.1-mini";

function buildMessages(
  body: GeneratePlanRequest,
  strengthProfile: NonNullable<GeneratePlanRequest["strengthProfile"]>,
) {
  const system = `You output JSON only for a product called Life Execution Panel.
This is NOT a fitness tracker, NOT a todo app, and NOT a generic habit tracker.
It is a daily execution system: concrete blocks the user will run today.

You MUST respond with a single JSON object and nothing else (no markdown, no prose).
The JSON must match this shape exactly:
{
  "summary": "short neutral explanation of the day plan (one or two sentences, factual)",
  "actions": [
    {
      "type": "workout" | "run" | "reading" | "project",
      "title": "short execution block title",
      "description": "optional string",
      "goal": "optional measurable goal string",
      "executionItems": [
        { "label": "row label", "plannedValue": "planned target as text" }
      ]
    }
  ]
}

Hard rules:
- "actions" MUST contain between 3 and 4 items (inclusive).
- Each action MUST include "executionItems" with between 1 and 16 rows (inclusive).
- Each executionItems row MUST be concrete: lifts + sets×reps; run distances/durations; reading pages/sections; project sub-tasks with time scope.
- Prefer the user's preferred action types when choosing "type" values.
- Align volume loosely with planningStyle: light = fewer/shorter rows; intense = slightly denser (still within limits).
- No motivational language, no cheerleading, no clichés.
- No generic todo items (e.g. "check email", "be productive"). If work is "project", name the artifact or scope in rows.
- "plannedValue" is always a short string the athlete/operator can compare against an "actual" later (e.g. "100×10", "20 pages", "45 min").

Strength profile (when strengthProfile.exercises is non-empty):
- The input JSON may include "strengthProfile" with the user's recent strength levels for exercises (bestLoadReps, recentAverage, lastPerformed).
- Do not invent unrealistic loads.
- Use strengthProfile as the baseline when generating plannedValue for matching or similar exercise labels.
- If the user recently completed 100x10 for an exercise, the next plan should usually stay around that range or increase very slightly.
- If the user's training phase (athleteProfile.phase in the input JSON) is "post_cycle", avoid aggressive progression.
- When strengthProfile.exercises is empty or missing, ignore these strength rules and plan from settings and history as before.

Good examples:
- workout rows: Bench press / plannedValue "100×10"
- run rows: Duration / plannedValue "20 min"
- reading rows: Pages / plannedValue "20"
- project rows: Task / plannedValue "Profile screen structure — 40 min"
`;

  const userPayload = {
    date: body.date,
    settings: body.settings,
    historySummary: body.historySummary ?? [],
    strengthProfile,
    ...(body.athleteProfile ? { athleteProfile: body.athleteProfile } : {}),
  };

  const user = `Generate today's plan using this input:\n${JSON.stringify(userPayload)}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export async function fetchOpenAiDailyPlan(
  body: GeneratePlanRequest,
  apiKey: string,
): Promise<OpenAiPlanJson | null> {
  const strengthProfile: NonNullable<GeneratePlanRequest["strengthProfile"]> =
    body.strengthProfile ?? { exercises: [] };
  console.log("strengthProfile", strengthProfile);
  const messages = buildMessages(body, strengthProfile);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[generate-plan] OpenAI HTTP error", res.status, errText);
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    console.error("[generate-plan] OpenAI empty content");
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    console.error("[generate-plan] OpenAI JSON parse failed");
    return null;
  }

  return parseAndValidateOpenAiPlanJson(parsed);
}
