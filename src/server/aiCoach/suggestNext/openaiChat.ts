/** Suggest-next OpenAI chat completions (server-only). */
export const MODEL = "gpt-4.1-mini";

export async function openAiSuggestChat(
  apiKey: string,
  systemContent: string,
  firstUser: string,
  followUp?: { assistantJson: string; userRetry: string },
): Promise<string | null> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
    { role: "user", content: firstUser },
  ];
  if (followUp) {
    messages.push(
      { role: "assistant", content: followUp.assistantJson },
      { role: "user", content: followUp.userRetry },
    );
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[ai-coach] OpenAI HTTP error", res.status, errText);
    return null;
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    console.error("[ai-coach] OpenAI empty content");
    return null;
  }
  return content;
}
