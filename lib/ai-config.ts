/** Default model for all Olready AI assistants (override with OPENAI_MODEL). */
export const DEFAULT_OPENAI_MODEL = "gpt-4o";

function stripEnvComment(value: string): string {
  return value.split("#")[0]?.trim() ?? "";
}

export function getOpenAiModel(): string {
  const raw = process.env.OPENAI_MODEL?.trim();
  if (!raw) return DEFAULT_OPENAI_MODEL;
  return stripEnvComment(raw) || DEFAULT_OPENAI_MODEL;
}

export function hasOpenAiKey(): boolean {
  const raw = process.env.OPENAI_API_KEY?.trim();
  if (!raw) return false;
  return stripEnvComment(raw).length > 0;
}

/** Default Claude model (override with ANTHROPIC_MODEL). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export function getAnthropicModel(): string {
  const raw = process.env.ANTHROPIC_MODEL?.trim();
  if (!raw) return DEFAULT_ANTHROPIC_MODEL;
  return stripEnvComment(raw) || DEFAULT_ANTHROPIC_MODEL;
}

export function hasAnthropicKey(): boolean {
  const raw = process.env.ANTHROPIC_API_KEY?.trim();
  if (!raw) return false;
  return stripEnvComment(raw).length > 0;
}

export function hasAnyLlmProvider(): boolean {
  return hasOpenAiKey() || hasAnthropicKey();
}
