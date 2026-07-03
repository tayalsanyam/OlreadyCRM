import { getAnthropicModel, hasAnthropicKey } from "@/lib/ai-config";
import type { ChatMessage } from "@/lib/ai-openai";

type CompleteOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export async function completeClaudeChat(
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<string> {
  if (!hasAnthropicKey()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const system = systemParts.join("\n\n").trim() || undefined;
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? getAnthropicModel(),
      max_tokens: options.maxTokens ?? 1200,
      temperature: options.temperature ?? 0.35,
      system,
      messages: convo.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });

  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(body.error?.message ?? `Anthropic ${res.status}`);
  }

  const text = body.content
    ?.filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("")
    .trim();

  if (!text) {
    throw new Error("Empty Claude response");
  }

  return text;
}
