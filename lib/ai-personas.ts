import {
  sanitizeAdvisorText,
  sanitizePublicSupportText,
  TICKET_AI_PERSONA,
} from "@/lib/ticket-ai-persona";

export { sanitizeAdvisorText, sanitizePublicSupportText, TICKET_AI_PERSONA };

export function buildUserPromptBlock(sections: Record<string, string | undefined>): string {
  return Object.entries(sections)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}:\n${v!.trim()}`)
    .join("\n\n");
}
