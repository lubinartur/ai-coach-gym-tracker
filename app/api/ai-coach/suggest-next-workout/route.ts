import { NextResponse } from "next/server";
import {
  fetchSuggestNextWorkoutFromOpenAI,
  getFallbackNextWorkoutSuggestion,
} from "@/server/aiCoachSuggestNext";
import type { AiCoachRequestPayload } from "@/types/aiCoach";

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
    return NextResponse.json(getFallbackNextWorkoutSuggestion());
  }

  const result = await fetchSuggestNextWorkoutFromOpenAI(
    body as AiCoachRequestPayload,
    apiKey,
  );
  if (!result) {
    return NextResponse.json(
      { error: "Could not generate suggestion. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}
