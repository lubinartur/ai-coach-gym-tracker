import { cap } from "@/lib/string/cap";
import { buildWorkoutInsightContext } from "@/lib/buildWorkoutInsightContext";
import { WORKOUT_INSIGHT_PROMPT } from "@/lib/prompts/workoutInsightPrompt";
import { stripJsonFence } from "@/server/openaiPlanJson";
import type { AiDecisionContext, AiInsight, SuggestNextWorkoutResponse } from "@/types/aiCoach";
import { getExerciseMuscleGroup, type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";

const INSIGHT_MODEL = "gpt-4.1-mini";

export type WorkoutInsightsOpenAIClient = {
  completeJson: (args: { system: string; user: string }) => Promise<string | null>;
};

export function createWorkoutInsightsOpenAIClient(apiKey: string): WorkoutInsightsOpenAIClient {
  return {
    completeJson: async ({ system, user }) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: INSIGHT_MODEL,
          temperature: 0.35,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[workout-insights] OpenAI HTTP error", res.status, errText);
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      return typeof content === "string" && content.trim() ? content : null;
    },
  };
}

type RawInsight = { title?: unknown; description?: unknown };

function parseInsightsJson(content: string): RawInsight[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const arr = o.insights;
  if (!Array.isArray(arr)) return null;
  return arr as RawInsight[];
}

const MUSCLE_KEYWORDS: { k: PrimaryMuscleGroup; re: RegExp }[] = [
  { k: "chest", re: /\b(chest|груд|pectoral)/i },
  { k: "back", re: /\b(back|спин|lat|lats|trap|ромб|тяг|широч)/i },
  { k: "shoulders", re: /\b(shoulder|delt|плеч|дельт)/i },
  { k: "biceps", re: /\b(bicep|бицеп)/i },
  { k: "triceps", re: /\b(tricep|трицеп)/i },
  { k: "legs", re: /\b(leg|quad|квадр|колен|squat|присед)/i },
  { k: "hamstrings", re: /\b(hamstring|задн|бедр|rdl|корпус бедра)/i },
  { k: "calves", re: /\b(calf|икр|gastroc)/i },
  { k: "core", re: /\b(core|abs|кор|пресс|abdom)/i },
  { k: "forearms", re: /\b(forearm|предплеч)/i },
];

function muscleGroupsInWorkout(workout: SuggestNextWorkoutResponse): Set<PrimaryMuscleGroup> {
  const s = new Set<PrimaryMuscleGroup>();
  for (const ex of workout.exercises) {
    const g = getExerciseMuscleGroup(ex.name);
    if (g !== "other") s.add(g);
  }
  return s;
}

function insightMentionsProgress(title: string, text: string): boolean {
  const s = `${title} ${text}`.toLowerCase();
  return /progress|increas|volume|overload|прогресс|объём|объем|добав|стимул|нагрузк/i.test(
    s,
  );
}

function insightMentionsUnknownMuscle(
  title: string,
  text: string,
  allowed: Set<PrimaryMuscleGroup>,
): boolean {
  const blob = `${title} ${text}`;
  for (const { k, re } of MUSCLE_KEYWORDS) {
    if (re.test(blob) && !allowed.has(k)) return true;
  }
  return false;
}

function inferInsightType(title: string, text: string): AiInsight["type"] {
  const s = `${title} ${text}`.toLowerCase();
  if (/fatigue|tired|устал|восстанов|recovery|deload/i.test(s)) return "fatigue";
  if (/risk|avoid|осторож|болезн/i.test(s)) return "risk";
  if (/balance|sequence|очеред|split|последов/i.test(s)) return "balance";
  if (/progress|прогресс|stimulus|объём|объем/i.test(s)) return "progress";
  return "opportunity";
}

function rawToAiInsights(raw: RawInsight[], increasedLen: number): AiInsight[] {
  const out: AiInsight[] = [];
  for (const it of raw.slice(0, 2)) {
    if (!it || typeof it !== "object") continue;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const text =
      typeof it.description === "string"
        ? it.description.trim()
        : typeof (it as { text?: unknown }).text === "string"
          ? String((it as { text?: string }).text).trim()
          : "";
    if (!title || !text) continue;
    out.push({
      type: inferInsightType(title, text),
      title: cap(title, 120),
      text: cap(text, 320),
    });
    if (out.length >= 2) break;
  }
  if (increasedLen === 0) {
    return out.filter((i) => !insightMentionsProgress(i.title, i.text));
  }
  return out;
}

function validateInsights(
  insights: AiInsight[],
  ctx: ReturnType<typeof buildWorkoutInsightContext>,
  workout: SuggestNextWorkoutResponse,
  warnings: string[],
): boolean {
  const allowedMuscles = muscleGroupsInWorkout(workout);
  const inc = ctx.actualChanges.increasedExercises.length;
  for (const i of insights) {
    if (insightMentionsProgress(i.title, i.text) && inc === 0) {
      warnings.push("Insight claims progression but no increased exercises in final workout");
      return false;
    }
    if (insightMentionsUnknownMuscle(i.title, i.text, allowedMuscles)) {
      warnings.push("Insight references a muscle group not present in this workout");
      return false;
    }
  }
  return insights.length >= 1;
}

function buildFallbackInsights(
  ctx: ReturnType<typeof buildWorkoutInsightContext>,
): AiInsight[] {
  const ru = ctx.language === "ru";
  const split = ctx.split.toLowerCase();
  const out: AiInsight[] = [];

  if (ctx.actualChanges.increasedExercises.length > 0) {
    out.push({
      type: "progress",
      title: ru ? "Есть прогрессия" : "Planned progression",
      text: ru
        ? "В нескольких упражнениях добавлен небольшой стимул без лишней перегрузки."
        : "A small bump in stimulus in a few lifts without unnecessary overload.",
    });
  }
  if (out.length < 2 && ctx.actualChanges.reducedExercises.length > 0) {
    out.push({
      type: "fatigue",
      title: ru ? "Контроль усталости" : "Fatigue management",
      text: ru
        ? "Нагрузку снижаем там, где восстановление ограничено."
        : "We ease load where recovery is the limiting factor.",
    });
  }
  if (out.length < 2 && /pull|тяг|спин/.test(split)) {
    out.push({
      type: "balance",
      title: ru ? "Фокус на тяге" : "Pulling focus",
      text: ru
        ? "После последней тренировки выбираем Pull для восстановления и баланса."
        : "After your last session, this Pull day supports recovery and balance.",
    });
  }
  if (out.length < 2 && /push|жим|press/.test(split)) {
    out.push({
      type: "opportunity",
      title: ru ? "Жимовой день" : "Push session",
      text: ru
        ? "Сессия с акцентом на жимы — логичный шаг в последовательности сплита."
        : "A press-focused session that fits your split rotation.",
    });
  }
  if (out.length < 2 && /leg|ног|squat|присед/.test(split)) {
    out.push({
      type: "opportunity",
      title: ru ? "Ноги в работе" : "Legs day",
      text: ru
        ? "Сегодня — нижняя часть тела для полноценного развития силы и объёма."
        : "Lower-body work to keep strength and volume moving.",
    });
  }
  if (out.length < 2) {
    out.push({
      type: "opportunity",
      title: ru ? "Связка с планом" : "Fits the plan",
      text: ru
        ? "Тренировка согласована с усталостью, сплитом и недавним объёмом."
        : "This session lines up with fatigue, split choice, and recent volume.",
    });
  }
  return out.slice(0, 2);
}

export async function generateWorkoutInsights(input: {
  workoutResult: SuggestNextWorkoutResponse;
  aiDecisionContext: AiDecisionContext | null | undefined;
  language: string | undefined;
  openaiClient: WorkoutInsightsOpenAIClient | null;
}): Promise<{
  insights: AiInsight[];
  source: "llm" | "fallback";
  warnings: string[];
}> {
  const warnings: string[] = [];
  const ctx = buildWorkoutInsightContext(
    input.workoutResult,
    input.aiDecisionContext,
    input.language,
  );

  if (!input.openaiClient) {
    return {
      insights: buildFallbackInsights(ctx),
      source: "fallback",
      warnings: ["No OpenAI client; using fallback insights."],
    };
  }

  const user = `Context JSON (use only this data; do not invent facts):\n${JSON.stringify(ctx)}`;
  const content = await input.openaiClient.completeJson({
    system: WORKOUT_INSIGHT_PROMPT,
    user,
  });

  if (!content) {
    warnings.push("LLM returned empty content");
    return { insights: buildFallbackInsights(ctx), source: "fallback", warnings };
  }

  const rawList = parseInsightsJson(content);
  if (!rawList) {
    warnings.push("Failed to parse insight JSON");
    return { insights: buildFallbackInsights(ctx), source: "fallback", warnings };
  }

  const incLen = ctx.actualChanges.increasedExercises.length;
  const insights = rawToAiInsights(rawList, incLen);
  if (!validateInsights(insights, ctx, input.workoutResult, warnings)) {
    return { insights: buildFallbackInsights(ctx), source: "fallback", warnings };
  }
  if (insights.length === 0) {
    warnings.push("No valid insights after validation");
    return { insights: buildFallbackInsights(ctx), source: "fallback", warnings };
  }

  return { insights: insights.slice(0, 2), source: "llm", warnings };
}
