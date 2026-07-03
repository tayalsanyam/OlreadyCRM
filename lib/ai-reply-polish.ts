import type { AiMode } from "@/lib/ticket-ai";

const INSTRUCTION_LEAK =
  /^(Output:|Output EXACTLY:|Task:|Answer quality:|Mode:|Subject:\s*<one line>|Body:\s*$|<email to MUA)/i;

/** Strip echoed prompt instructions from any domain reply. */
export function stripInstructionLeak(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (INSTRUCTION_LEAK.test(t)) continue;
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripGrievancePromptLeak(text: string): string {
  return stripInstructionLeak(text);
}

export function muaFirstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

/** Replace common LLM placeholders with the pipeline MUA's first name. */
export function polishSalesReply(reply: string, muaName: string | null | undefined): string {
  const first = muaFirstName(muaName);
  if (!first) return stripInstructionLeak(reply);

  let out = stripInstructionLeak(reply);
  for (const p of [
    /\[MUA Name\]/gi,
    /\[MUA name\]/gi,
    /\[Name\]/gi,
    /\{MUA Name\}/gi,
    /\<MUA Name\>/gi,
    /\[MUA's Name\]/gi,
  ]) {
    out = out.replace(p, first);
  }

  if (/^(Hi|Hey|Hello)\s+(there|friend|mate)\b/i.test(out.trim())) {
    out = out.replace(/^(Hi|Hey|Hello)\s+(there|friend|mate)\b/i, `$1 ${first}`);
  }

  return out;
}

export function polishRmReply(reply: string): string {
  return stripInstructionLeak(reply);
}

export function polishGrievanceReply(reply: string, _mode?: AiMode): string {
  return stripGrievancePromptLeak(reply);
}

/** Pull list-like facts from RAG markdown for deterministic fallbacks. */
export function extractRagBulletFacts(text: string, max = 3): string[] {
  if (!text.trim()) return [];

  const bullets: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = t.match(/^(?:[-*•]|\d+[.)])\s+(.+)/);
    if (!m) continue;
    const fact = m[1].replace(/\*\*/g, "").trim();
    if (fact.length >= 15 && fact.length <= 200) bullets.push(fact);
    if (bullets.length >= max) break;
  }

  if (bullets.length) return bullets;

  const sentences = text
    .replace(/^#+\s.+$/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 180);
  return sentences.slice(0, max);
}
