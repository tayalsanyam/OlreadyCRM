import { getAiDomain } from "@/lib/ai-domains";

/** Grievance / care internal advisor system prompt. */
export const TICKET_AI_PERSONA = getAiDomain("grievance").systemPrompt;

function scrubLegalEntityNames(text: string): string {
  return text
    .replace(/KSM Beauty Pvt\.?\s*Ltd\.?/gi, "Team Olready")
    .replace(/KSM Beauty/gi, "Team Olready")
    .replace(/KATALYST INFOMEDIA/gi, "Team Olready");
}

/** Internal care / RM / sales AI — redact owner name for staff-facing output. */
export function sanitizeAdvisorText(text: string): string {
  return scrubLegalEntityNames(text).replace(/\bSanyam\b/gi, "authorized Olready team member");
}

/** Public /support chat — visitors are MUAs/brides, never internal staff. */
export function sanitizePublicSupportText(text: string, visitorFirstName?: string): string {
  const greetingName = visitorFirstName?.trim().split(/\s+/)[0] || "there";
  const visitorIsSanyam = greetingName.toLowerCase() === "sanyam";

  let out = scrubLegalEntityNames(text);

  if (!visitorIsSanyam) {
    out = out
      .replace(/\bSanyam(?:\s*\/\s*team)?\b/gi, "Team Olready")
      .replace(/\bauthorized Olready team member\b/gi, greetingName === "there" ? "there" : greetingName)
      .replace(/\bHi authorized Olready team member\b/gi, `Hi ${greetingName}`)
      .replace(/\bDear authorized Olready team member\b/gi, `Hi ${greetingName}`);
  }

  return out
    .replace(/\bHi team member\b/gi, `Hi ${greetingName}`)
    .replace(/\bDear team member\b/gi, `Hi ${greetingName}`)
    .replace(/\n\nBest,?\s*\nTeam Olready/gi, "\n\nTeam Olready")
    .replace(/\nBest,?\s*\nTeam Olready/gi, "\nTeam Olready");
}
