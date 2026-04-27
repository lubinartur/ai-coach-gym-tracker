import { NextResponse } from "next/server";
import { parseAppLanguage } from "@/i18n/language";
import { fetchWorkoutReviewFromOpenAI } from "@/server/aiCoachReviewWorkout";
import type { WorkoutReviewRequestPayload } from "@/types/aiCoach";

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

  return NextResponse.json(result);
}
