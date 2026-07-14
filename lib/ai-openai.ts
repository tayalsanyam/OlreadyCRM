import { getOpenAiModel, hasOpenAiKey } from "@/lib/ai-config";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

type CompleteOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

const RETRYABLE = /429|500|502|503|504|rate limit|timeout|overloaded|temporarily unavailable/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function completeChatOnce(
  messages: ChatMessage[],
  options: CompleteOptions,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? getOpenAiModel(),
      messages,
      temperature: options.temperature ?? 0.35,
      max_tokens: options.maxTokens ?? 1200,
    }),
  });

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(body.error?.message ?? `OpenAI ${res.status}`);
  }

  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty OpenAI response");
  }

  return content;
}

export async function completeChat(
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<string> {
  if (!hasOpenAiKey()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await completeChatOnce(messages, options);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const retryable = RETRYABLE.test(lastError.message);
      if (attempt < 2 && retryable) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("OpenAI request failed");
}
