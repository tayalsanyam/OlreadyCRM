import { hasAnthropicKey, hasOpenAiKey } from "@/lib/ai-config";
import { completeClaudeChat } from "@/lib/ai-claude";
import { completeChat, type ChatMessage } from "@/lib/ai-openai";
import type { AiReplySource } from "@/lib/ai-reply-source";

type CompleteOptions = {
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export type LlmReplySource = Extract<AiReplySource, "openai" | "claude">;

/**
 * Try OpenAI first (with retries), then Claude if configured.
 * Throws if all configured providers fail.
 */
export async function completeChatWithProviders(
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<{ content: string; source: LlmReplySource }> {
  let lastError: Error | null = null;

  if (hasOpenAiKey()) {
    try {
      const content = await completeChat(messages, options);
      return { content, source: "openai" };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (hasAnthropicKey()) {
    try {
      const content = await completeClaudeChat(messages, options);
      return { content, source: "claude" };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!hasOpenAiKey() && !hasAnthropicKey()) {
    throw new Error("No LLM provider configured");
  }

  throw lastError ?? new Error("All LLM providers failed");
}
