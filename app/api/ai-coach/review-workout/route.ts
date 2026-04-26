import { NextResponse } from "next/server";
import { parseAppLanguage } from "@/i18n/language";
import { fetchWorkoutReviewFromOpenAI } from "@/server/aiCoachReviewWorkout";
import type { WorkoutReviewRequestPayload } from "@/types/aiCoach";
import { recordCoachDecision, type CoachMemoryEntry } from "@/services/aiCoachMemory";

function inferMemoryFromNote(note: string): Pick<CoachMemoryEntry, "observation" | "decision" | "confidence"> | null {
  const s = note.toLowerCase();
  // Stagnation / swap
  if (/(stall|stagnat|stuck|plateau|swap|variation|стагнац|плато|застрял|вариац|смен)/i.test(s)) {
    return { observation: "stagnation", decision: "swap_exercise", confidence: 64 };
  }
  // Rep drop / maintain
  if (/(rep drop|dropped reps|fell off|срыв повтор|упал.*повтор|падение повтор)/i.test(s)) {
    return { observation: "rep_drop", decision: "maintain", confidence: 58 };
  }
  // Fatigue / reduce load
  if (/(fatigue|tired|exhaust|deload|recover|устал|утом|восстанов|делоад|разгруз)/i.test(s)) {
    return { observation: "fatigue", decision: "reduce_load", confidence: 60 };
  }
  // Good progress / increase weight
  if (/(good|strong|solid|progress|improv|nice|отлично|сильно|прогресс|улучш)/i.test(s)) {
    return { observation: "good_progress", decision: "increase_weight", confidence: 62 };
  }
  return null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Could not generate review." },
      { status: 503 },
    );
  }

  const raw = body as WorkoutReviewRequestPayload;
  const payload: WorkoutReviewRequestPayload = {
    ...raw,
    language: parseAppLanguage(raw.language),
  };

  const result = await fetchWorkoutReviewFromOpenAI(payload, apiKey);
  if (!result) {
    return NextResponse.json(
      { error: "Could not generate review." },
      { status: 502 },
    );
  }

  // Best-effort coach memory recording. Never breaks the review response.
  try {
    const sessionId = payload.completedSession?.id;
    if (sessionId && Array.isArray(result.exercise_notes)) {
      for (const row of result.exercise_notes) {
        const exercise = row?.name?.trim();
        const note = row?.note?.trim();
        if (!exercise || !note) continue;
        const inferred = inferMemoryFromNote(note);
        if (!inferred) continue;
        recordCoachDecision({
          sessionId,
          exercise,
          observation: inferred.observation,
          decision: inferred.decision,
          confidence: inferred.confidence,
          createdAt: Date.now(),
        });
      }
    }
  } catch (e) {
    console.warn("[ai-coach review] coach memory recording failed", e);
  }

  return NextResponse.json(result);
}
