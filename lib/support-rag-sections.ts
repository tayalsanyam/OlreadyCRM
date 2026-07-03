import type { RagDocChunk } from "@/lib/ai-rag";
import { PLANS_RAG_FILENAME } from "@/lib/rag-content";
import type { SupportChatMode } from "@/lib/support-chat-mode";
import { isPlanPricingQuery } from "@/lib/ai-rag";

export type SupportTopic =
  | "plans"
  | "leads_flow"
  | "reversal"
  | "rm_support"
  | "onboarding"
  | "reactivation"
  | "bride"
  | "general";

type TopicConfig = {
  id: SupportTopic;
  pattern: RegExp | ((query: string) => boolean);
  sectionHints: string[];
  docBoost: string[];
};

const TOPICS: TopicConfig[] = [
  {
    id: "plans",
    pattern: isPlanPricingQuery,
    sectionHints: ["Plan comparison", "PRIME", "PRO", "PHOENIX", "Price", "plan"],
    docBoost: [PLANS_RAG_FILENAME, "Olready_Sales_Toolkit.md"],
  },
  {
    id: "leads_flow",
    pattern:
      /\b(how.*lead|lead.*work|bridal lead|leads work|profile push|weekly push|unlock|lead cap|lead access|queries routed|how many lead|how many quer)\b/i,
    sectionHints: [
      "MUA partner flow",
      "Leads",
      "PRIME",
      "PRO",
      "PHOENIX",
      "Comparison Summary",
    ],
    docBoost: [PLANS_RAG_FILENAME, "Olready_Sales_Toolkit.md"],
  },
  {
    id: "reversal",
    pattern: /\b(reversal|reverse|report a problem|non.?responsive|already booked|lead issue|lead credit)\b/i,
    sectionHints: ["Lead Reversal", "Eligible reversal", "Reporting channels", "Important rules"],
    docBoost: ["Olready_Sales_Toolkit.md", "Olready_Master_Knowledge_Dump_No_Pricing.md"],
  },
  {
    id: "rm_support",
    pattern: /\b(rm|relationship manager|who is my rm|contact rm|rm support)\b/i,
    sectionHints: ["RM support", "Training", "MUA partner flow", "Role of RM"],
    docBoost: ["Olready_Sales_Toolkit.md"],
  },
  {
    id: "onboarding",
    pattern: /\b(onboard|sign up|signup|join|get started|activation|training|demo)\b/i,
    sectionHints: ["MUA partner flow", "Deal close and onboarding", "Pipeline stages"],
    docBoost: ["Olready_Sales_Toolkit.md"],
  },
  {
    id: "reactivation",
    pattern: /\b(rejoin|reactivat|lapsed|expired plan|come back|renew)\b/i,
    sectionHints: ["Existing No Plan", "Three MUA categories", "MUA partner flow"],
    docBoost: ["Olready_Sales_Toolkit.md", PLANS_RAG_FILENAME],
  },
  {
    id: "bride",
    pattern: /\b(bride|wedding|makeup consultation|booking|artist|trial)\b/i,
    sectionHints: ["Assured", "bride", "Bride", "consultation"],
    docBoost: ["Olready_Bride_Side_Knowledge_Bank_RAG.md"],
  },
];

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

export function detectSupportTopic(query: string, mode: SupportChatMode): SupportTopic {
  const matches = (pattern: TopicConfig["pattern"]) =>
    typeof pattern === "function" ? pattern(query) : pattern.test(query);

  if (mode === "bride") {
    return TOPICS.find((t) => t.id === "bride" && matches(t.pattern))?.id ?? "bride";
  }

  for (const topic of TOPICS) {
    if (topic.id === "bride") continue;
    if (matches(topic.pattern)) return topic.id;
  }

  return mode === "mua_sales" ? "leads_flow" : "general";
}

export function getTopicDocBoost(topic: SupportTopic): string[] {
  return TOPICS.find((t) => t.id === topic)?.docBoost ?? [];
}

function sectionHintBoost(heading: string, hints: string[]): number {
  const h = heading.toLowerCase();
  for (const hint of hints) {
    if (h.includes(hint.toLowerCase())) return 50;
  }
  return 0;
}

export function extractRelevantSections(
  content: string,
  query: string,
  topic: SupportTopic,
  maxChars = 2200,
): string {
  const config = TOPICS.find((t) => t.id === topic);
  const hints = config?.sectionHints ?? [];
  const sections = splitMarkdownSections(content);

  if (!sections.length) return content.slice(0, maxChars);

  const ranked = sections
    .map((s) => ({
      ...s,
      score:
        scoreText(query, `${s.heading} ${s.body}`) + sectionHintBoost(s.heading, hints),
    }))
    .filter((s) => s.score > 0 || sectionHintBoost(s.heading, hints) > 0)
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

export function formatSupportRagExcerpts(
  docs: RagDocChunk[],
  query: string,
  mode: SupportChatMode,
  maxCharsPerDoc = 2200,
): string {
  const topic = detectSupportTopic(query, mode);
  const config = TOPICS.find((t) => t.id === topic);
  const boostOrder = config?.docBoost ?? [];

  const sorted = [...docs].sort((a, b) => {
    const ai = boostOrder.indexOf(a.filename);
    const bi = boostOrder.indexOf(b.filename);
    const ap = ai === -1 ? 999 : ai;
    const bp = bi === -1 ? 999 : bi;
    if (ap !== bp) return ap - bp;
    return b.score - a.score;
  });

  return sorted
    .map((d) => {
      const body = extractRelevantSections(d.contentText, query, topic, maxCharsPerDoc);
      return `## ${d.title}${d.category ? ` (${d.category})` : ""}\n${body}`;
    })
    .join("\n\n");
}
