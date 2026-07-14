/** How a support (or other) assistant reply was produced. */
export type AiReplySource = "openai" | "claude" | "fallback" | "handoff";

export const AI_REPLY_SOURCE_LABELS: Record<AiReplySource, string> = {
  openai: "OpenAI",
  claude: "Claude",
  fallback: "Structured fallback",
  handoff: "Signup handoff",
};
