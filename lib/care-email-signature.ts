import { CARE_PHONE_DISPLAY } from "@/lib/care-contact";

export const CARE_EMAIL_SIGNOFF_PLAIN = `Team Olready\n${CARE_PHONE_DISPLAY}`;

export const CARE_EMAIL_SIGNOFF_HTML = `Team Olready<br>${CARE_PHONE_DISPLAY}`;

export function appendCareEmailSignature(body: string, format: "plain" | "html" = "plain"): string {
  const trimmed = body.trimEnd();
  if (trimmed.includes("Team Olready") && trimmed.includes(CARE_PHONE_DISPLAY)) {
    return body;
  }
  const sig = format === "html" ? CARE_EMAIL_SIGNOFF_HTML : CARE_EMAIL_SIGNOFF_PLAIN;
  const sep = format === "html" ? "<br><br>" : "\n\n";
  return `${trimmed}${sep}${sig}`;
}
