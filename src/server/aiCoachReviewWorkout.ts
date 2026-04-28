import type { AppLanguage } from "@/i18n/language";
import { parseAppLanguage } from "@/i18n/language";
import { shouldRetryRussianWorkoutReview } from "@/lib/aiWorkoutReviewLanguageCheck";
import type {
  WorkoutAiReview,
  WorkoutReviewGrade,
  WorkoutReviewRequestPayload,
} from "@/types/aiCoach";
import { enforceWorkoutReviewLimits } from "@/lib/workoutReviewDisplay";
import { stripJsonFence } from "@/server/openaiPlanJson";

const MODEL = "gpt-4.1-mini";
const MAX_ATTEMPTS = 3;

const systemPromptEn = `You are an AI strength coach analyzing a completed workout.

Keep responses concise and coach-like. Be warm and direct, not like a lab report. Use short, simple sentences.

Do not invent medical, injury, or hormone details. Use only the workout data and optional profile in the JSON.

## Response language
The JSON includes "language": "en". You MUST write verdict, summary, all bullet lines, and every exercise_notes.note in clear English. Keep exercise "name" values exactly as in the log (English names are fine).

## Session score (required)
- "score" is an **integer 0–100** reflecting how well this session was executed and programmed given the data. Do not reward only high volume. Penalize: excessive volume with fatigue signs, big rep drop-offs, sloppy progression. Reward: completed sets, stable execution, realistic progression, consistency, alignment with the athlete's goal in the data.
- Rough bands: 90–100 = excellent; 80–89 = strong; 70–79 = good but needs attention; 60–69 = mixed; below 60 = poor or recovery/execution issue.
- "grade" must be one of: A+, A, B+, B, C, D — and must **roughly** match the score (e.g. 84 with B+).
- "verdict" is 1–2 **short, human** sentences: the main takeaway (quality, one caveat if any). It is the headline, not a repeat of every bullet.

## Workout context
The user JSON includes a workoutContext object. Read it from JSON:
- workoutContext.mode
- workoutContext.target_muscles
- workoutContext.duration
- workoutContext.sets
- workoutContext.exercises

## Rules
If workoutContext.mode is SINGLE MUSCLE:
Do NOT criticize missing other muscle groups.
Do NOT suggest adding unrelated muscle groups.
Instead evaluate:
1. Volume (for the target muscle)
2. Exercise selection (variety)
3. Consistency (sets/reps stability)
4. Training density (work done per time, if duration is reliable)

Ensure the score matches the feedback.

## Duration (important)
- If completedSession.durationMin is present and is **less than 5 minutes**, treat it as unreliable test/manual-entry data.
- In that case: DO NOT generate any "very short session" / "too short" duration critique and DO NOT penalize the score for duration.
- Only consider duration-based feedback when durationMin is **5 minutes or more**.

Return ONLY valid JSON (no markdown):

{
  "score": 0,
  "grade": "B+",
  "verdict": "short human summary, 1–2 sentences max",
  "summary": "2–3 short sentences. Like you're texting them after the session: what kind of day it was, one thing that stood out, and overall vibe. No bullet list inside. No corporate tone. May expand on verdict but avoid repeating bullets verbatim.",
  "went_well": [ "at most 3 items; each is ONE short sentence" ],
  "needs_attention": [ "at most 2 items; each is ONE short sentence" ],
  "next_time": [ "at most 2 items; each is ONE short sentence, practical" ],
  "exercise_notes": [ { "name": "from log", "note": "1–2 short lines max" } ]
}

STRICT COUNTS: went_well max 3, needs_attention max 2, next_time max 2. Never exceed.
Each string in went_well, needs_attention, and next_time must be a single sentence, under ~20 words, plain language. No compound sentences listing two exercises (bad: "Machine A and B show X." Good: "Shoulder press held steady through your sets.").
"exercise_notes": ONLY for main lifts in the session if useful: barbell or dumbbell bench press, back/front squat, deadlift or RDL, overhead/shoulder press, OHP. If not relevant, return []. Max 4 total.

Tone examples (English):
- Bad: "High volume push session with solid execution and consistent effort."
- Good: "Strong push workout. You held effort across the big lifts."

- Bad: "Machine Lateral Raise volume is high with good rep ranges."
- Good: "Lateral raises had strong volume."

No markdown. JSON only. JSON keys in English; string values in English for user-facing text.

If athleteProfile is in the JSON and is useful, one short alignment comment is OK; if absent or empty, do not make up goals.`;

const systemPromptRu = `Ты AI‑тренер по силе: анализируешь завершённую тренировку.

Пиши по-человечески, тепло и по делу, без сухого отчёта. Только факты из JSON с данными; не придумывай травмы, анализы крови и т. п.

## Язык ответа
Во входных данных поле "language" равно "ru". Всё, что читает человек, должно быть ПО-РУССКИ: "verdict", "summary", все пункты в массивах, текст в "exercise_notes.note". Ключи JSON — на английском. Значения "grade" (A+, B+ и т. д.) — латиницей как в схеме. Поле "name" в exercise_notes — название движения КАК В ДНЕВНИКЕ (часто на английском) — НЕ ПЕРЕВОДИ названия упражнений.

## Оценка (обязательно)
- "score" — целое 0–100, насколько удачно прошла тренировка по логу. Не оценивай только большим объёмом. Штраф: лишний объём при усталости, сильный срыв повторов, плохая прогрессия. Похвала: закрытые подходы, стабильная техника, реалистичная прогрессия, согласованность с целью из данных.
- Диапазоны: 90–100 отлично; 80–89 сильно; 70–79 хорошо, но есть внимание; 60–69 смешанно; ниже 60 слабо/восстановление.
- "grade": одна из: A+, A, B+, B, C, D — должна **примерно** согласовываться с числом "score" (например 84 и B+).
- "verdict" — 1–2 короткие фразы-итог: людьми, главный вывод, одна оговорка при необходимости.

## Контекст тренировки
Во входном JSON есть объект workoutContext. Читай его прямо из JSON:
- workoutContext.mode
- workoutContext.target_muscles
- workoutContext.duration
- workoutContext.sets
- workoutContext.exercises

## Правила
Если workoutContext.mode = SINGLE MUSCLE:
НЕ ругай за отсутствие других групп мышц.
НЕ предлагай добавлять нерелевантные группы мышц.
Оцени:
1. Объём на целевую мышцу
2. Выбор/разнообразие упражнений
3. Стабильность подходов
4. Плотность тренировки (если длительность надёжна)

Оценка score должна соответствовать тому, что ты написал.

## Длительность (важно)
- Если completedSession.durationMin есть и она **меньше 5 минут**, считай это тестовой/ручной записью и не делай выводов по длительности.
- В этом случае: НЕ пиши замечания "слишком короткая тренировка" и НЕ штрафуй score за длительность.
- Анализ по длительности применяй только если durationMin **5 минут или больше**.

Верни ТОЛЬКО валидный JSON (без markdown):

{
  "score": 0,
  "grade": "B+",
  "verdict": "1–2 короткие фразы-итогов",
  "summary": "2–3 предложения: детальнее о сессии, настрое, без копипаста пунктов",
  "went_well": [ "не больше 3 пунктов, каждый — ОДНО короткое предложение" ],
  "needs_attention": [ "не больше 2 пунктов, каждое — одно предложение" ],
  "next_time": [ "не больше 2 практичных пункта, одно предложение" ],
  "exercise_notes": [ { "name": "как в логе", "note": "1–2 короткие строки" } ]
}

СТРОГО: went_well максимум 3, needs_attention максимум 2, next_time максимум 2.
Каждый пункт — одно предложение, ~до 20 слов. Не перечисляй в одной фразе два разных тренажёра.
exercise_notes: только по основным движениям, если важно (жим лёжа, присед, тяга, жим стоя/OHP, RDL). Иначе []. Не больше 4 заметок.

Пример тона (по-русски):
- Плохо: "High volume push session with solid execution."
- Хорошо: "Сильная толкающая тренировка, старался стабильно в больших движениях."

- Плохо: "Lateral raise volume is high with good rep ranges."
- Хорошо: "Боковые поднятия взял объёмно, повторы ровные."

Никакого markdown. Только JSON. Профиль athlete — только если уместен; пустой профиль не выдумывай.`;

const retrySystemSuffixRu = `

## КРИТИЧНО
Предыдущий ответ был в основном на английском, а нужен РУССКИЙ для ВСЕХ пояснений. Повтори ответ: verdict, summary, went_well, needs_attention, next_time — только на русском; exercise_notes.note — только на русском. "grade" — латинскими буквами. Названия в "name" оставь как в дневнике. JSON-ключи на английском.`;

function buildSystemInstruction(lang: AppLanguage, attempt: number): string {
  const base = lang === "ru" ? systemPromptRu : systemPromptEn;
  if (lang === "ru" && attempt > 1) {
    return `${base}${retrySystemSuffixRu}`;
  }
  return base;
}

function parseAndValidate(raw: unknown): WorkoutAiReview | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.summary !== "string" || !o.summary.trim()) return null;
  if (typeof o.score !== "number" || !Number.isFinite(o.score)) return null;
  if (typeof o.grade !== "string" || !o.grade.trim()) return null;
  if (typeof o.verdict !== "string" || !o.verdict.trim()) return null;
  if (!Array.isArray(o.went_well)) return null;
  if (!Array.isArray(o.needs_attention)) return null;
  if (!Array.isArray(o.next_time)) return null;
  if (!Array.isArray(o.exercise_notes)) return null;

  const went_well = o.went_well.filter(
    (x) => typeof x === "string" && x.trim().length > 0,
  ) as string[];
  const needs_attention = o.needs_attention.filter(
    (x) => typeof x === "string" && x.trim().length > 0,
  ) as string[];
  const next_time = o.next_time.filter(
    (x) => typeof x === "string" && x.trim().length > 0,
  ) as string[];

  const exercise_notes: WorkoutAiReview["exercise_notes"] = [];
  for (const row of o.exercise_notes) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (typeof r.name !== "string" || !r.name.trim()) return null;
    if (typeof r.note !== "string" || !r.note.trim()) return null;
    exercise_notes.push({ name: r.name.trim(), note: r.note.trim() });
  }

  return enforceWorkoutReviewLimits({
    score: o.score,
    grade: o.grade.trim() as WorkoutReviewGrade,
    verdict: o.verdict.trim(),
    summary: o.summary.trim(),
    went_well,
    needs_attention,
    next_time,
    exercise_notes,
  });
}

function buildUserPayload(input: WorkoutReviewRequestPayload, lang: AppLanguage) {
  const cs = input.completedSession;
  const exerciseList = (cs.exercises ?? []).map((e) => e.name).filter(Boolean);
  return {
    language: lang,
    workoutContext: {
      mode: cs.workoutMode ?? "custom",
      target_muscles: cs.targetMuscles ?? [],
      duration: cs.durationMin ?? null,
      sets: cs.totalSets,
      exercises: exerciseList,
    },
    athleteProfile: input.athleteProfile,
    completedSession: input.completedSession,
    priorSessions: input.priorSessions,
    exerciseStats: input.exerciseStats,
    logTotals: input.logTotals,
  };
}

async function callOpenAi(
  system: string,
  userContent: string,
  apiKey: string,
): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[ai-coach review] OpenAI HTTP error", res.status, errText);
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    console.error("[ai-coach review] OpenAI empty content");
    return null;
  }
  return content;
}

export async function fetchWorkoutReviewFromOpenAI(
  input: WorkoutReviewRequestPayload,
  apiKey: string,
): Promise<WorkoutAiReview | null> {
  const locale = parseAppLanguage(input.locale ?? input.language);
  const lang = locale;
  const userJson = buildUserPayload(input, lang);
  const user = `Workout review context.

Language:
- If locale = "ru", respond ONLY in Russian.
- If locale = "en", respond ONLY in English.

The UI locale is "${lang}". All coach-facing text (verdict, summary, bullet strings, and exercise_notes notes) must be in ${lang === "ru" ? "Russian" : "English"}. Do not mix languages. "grade" stays Latin (A+, B+…). Exercise names in "name" stay as in the log.

JSON:
${JSON.stringify({ ...userJson, locale: lang })}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const system = buildSystemInstruction(lang, attempt);
    const content = await callOpenAi(system, user, apiKey);
    if (!content) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(content));
    } catch {
      console.error("[ai-coach review] JSON parse failed");
      if (attempt === MAX_ATTEMPTS) return null;
      continue;
    }

    const valid = parseAndValidate(parsed);
    if (!valid) {
      if (attempt === MAX_ATTEMPTS) return null;
      continue;
    }

    if (lang === "ru" && shouldRetryRussianWorkoutReview(valid)) {
      console.warn(
        "[ai-coach review] Russian review looked English-heavy; retrying",
        { attempt },
      );
      if (attempt === MAX_ATTEMPTS) return null;
      continue;
    }

    return valid;
  }

  return null;
}
