import type { RagDocChunk } from "@/lib/ai-rag";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreText(query: string, text: string, hintBoost = 0): number {
  const q = new Set(tokenize(query));
  if (!q.size) return hintBoost;
  let score = hintBoost;
  for (const w of tokenize(text)) {
    if (q.has(w)) score += 1;
  }
  return score;
}

type MdSection = { heading: string; body: string };

function splitMarkdownSections(content: string): MdSection[] {
  const chunks = content.split(/\n(?=##\s+)/);
  const sections: MdSection[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^##\s+(.+?)(?:\n([\s\S]*))?$/);
    if (match) {
      sections.push({ heading: match[1].trim(), body: (match[2] ?? "").trim() });
    } else if (sections.length === 0) {
      sections.push({ heading: "Introduction", body: trimmed });
    }
  }

  return sections;
}

function sectionHintBoost(heading: string, hints: string[]): number {
  const h = heading.toLowerCase();
  for (const hint of hints) {
    if (h.includes(hint.toLowerCase())) return 50;
  }
  return 0;
}

export function extractFocusedSections(
  content: string,
  query: string,
  sectionHints: string[] = [],
  maxChars = 2200,
): string {
  const sections = splitMarkdownSections(content);
  if (!sections.length) return content.slice(0, maxChars);

  const ranked = sections
    .map((s) => ({
      ...s,
      score: scoreText(query, `${s.heading} ${s.body}`) + sectionHintBoost(s.heading, sectionHints),
    }))
    .filter((s) => s.score > 0 || sectionHintBoost(s.heading, sectionHints) > 0)
    .sort((a, b) => b.score - a.score);

  const picked = ranked.length ? ranked : sections.slice(0, 3);
  const parts: string[] = [];
  let len = 0;

  for (const s of picked) {
    const block = `### ${s.heading}\n${s.body}`;
    if (len + block.length > maxChars) {
      const room = maxChars - len - 20;
      if (room > 200) parts.push(`${block.slice(0, room)}…`);
      break;
    }
    parts.push(block);
    len += block.length;
  }

  return parts.join("\n\n") || content.slice(0, maxChars);
}

export function formatFocusedRagExcerpts(
  docs: RagDocChunk[],
  query: string,
  options: {
    sectionHints?: string[];
    docBoost?: string[];
    maxCharsPerDoc?: number;
  } = {},
): string {
  const { sectionHints = [], docBoost = [], maxCharsPerDoc = 2200 } = options;

  const sorted = [...docs].sort((a, b) => {
    const ai = docBoost.indexOf(a.filename);
    const bi = docBoost.indexOf(b.filename);
    const ap = ai === -1 ? 999 : ai;
    const bp = bi === -1 ? 999 : bi;
    if (ap !== bp) return ap - bp;
    return b.score - a.score;
  });

  return sorted
    .map((d) => {
      const body = extractFocusedSections(d.contentText, query, sectionHints, maxCharsPerDoc);
      return `## ${d.title}${d.category ? ` (${d.category})` : ""}\n${body}`;
    })
    .join("\n\n");
}
