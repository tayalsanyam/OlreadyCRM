import type { TransactionSql } from "@/db/index";
import type { AiDomain } from "@/lib/ai-domains";
import { getAiDomain } from "@/lib/ai-domains";
import type { SupportChatMode } from "@/lib/support-chat-mode";
import { SUPPORT_MODE_RAG_PRIORITY } from "@/lib/support-chat-mode";
import { PLANS_RAG_FILENAME } from "@/lib/rag-content";
import { detectSupportTopic, getTopicDocBoost } from "@/lib/support-rag-sections";

export type RagDocChunk = {
  title: string;
  filename: string;
  category: string | null;
  contentText: string;
  score: number;
  source: "sales" | "policy";
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreDoc(query: string, content: string): number {
  const q = new Set(tokenize(query));
  if (!q.size) return 0;
  let score = 0;
  for (const w of tokenize(content)) {
    if (q.has(w)) score += 1;
  }
  return score;
}

async function fetchSalesDocs(
  tx: TransactionSql,
  filenames: string[],
): Promise<Omit<RagDocChunk, "score">[]> {
  if (!filenames.length) return [];

  const rows = await tx<
    { filename: string; contentText: string }[]
  >`
    SELECT filename, content_text AS "contentText"
    FROM sales.ai_documents
    WHERE filename = ANY(${filenames})
    ORDER BY created_at DESC
  `;

  return rows.map((r: { filename: string; contentText: string }) => ({
    title: r.filename.replace(/\.md$/i, ""),
    filename: r.filename,
    category: "sales",
    contentText: r.contentText,
    source: "sales" as const,
  }));
}

async function fetchPolicyDocs(
  tx: TransactionSql,
  filenames: string[],
): Promise<Omit<RagDocChunk, "score">[]> {
  if (!filenames.length) return [];

  const rows = await tx<
    { title: string; category: string | null; contentText: string; sourceFilename: string | null }[]
  >`
    SELECT title, category, content_text AS "contentText", source_filename AS "sourceFilename"
    FROM support.policy_documents
    WHERE active = true
      AND source_filename = ANY(${filenames})
    ORDER BY created_at DESC
  `;

  return rows.map(
    (r: {
      title: string;
      category: string | null;
      contentText: string;
      sourceFilename: string | null;
    }) => ({
      title: r.title,
      filename: r.sourceFilename ?? r.title,
      category: r.category,
      contentText: r.contentText,
      source: "policy" as const,
    }),
  );
}

export async function rankDocumentsForDomain(
  tx: TransactionSql,
  domain: AiDomain,
  query: string,
  limit = 5,
): Promise<RagDocChunk[]> {
  const config = getAiDomain(domain);
  const [salesDocs, policyDocs] = await Promise.all([
    fetchSalesDocs(tx, [...config.salesTableFiles]),
    fetchPolicyDocs(tx, [...config.policyTableFiles]),
  ]);

  const all = [...salesDocs, ...policyDocs];

  return all
    .map((d): RagDocChunk => ({
      ...d,
      score: scoreDoc(query, d.contentText),
    }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Rank all domain docs when query token overlap is zero (fallback to most recent). */
export const PLAN_PRICING_QUERY =
  /\b(plan|plans|pricing|price|cost|fee|package|tier|prime|pro|phoenix|included|subscription|lead|quer(y|ies)|how many|detail|compare|offer)\b/i;

export function isPlanPricingQuery(query: string): boolean {
  return PLAN_PRICING_QUERY.test(query);
}

async function fetchSinglePolicyDoc(
  tx: TransactionSql,
  filename: string,
): Promise<Omit<RagDocChunk, "score"> | null> {
  const rows = await tx<
    { title: string; category: string | null; contentText: string; sourceFilename: string | null }[]
  >`
    SELECT title, category, content_text AS "contentText", source_filename AS "sourceFilename"
    FROM support.policy_documents
    WHERE active = true AND source_filename = ${filename}
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    title: r.title,
    filename: r.sourceFilename ?? filename,
    category: r.category,
    contentText: r.contentText,
    source: "policy" as const,
  };
}

export async function rankDocumentsForDomainWithFallback(
  tx: TransactionSql,
  domain: AiDomain,
  query: string,
  limit = 5,
): Promise<RagDocChunk[]> {
  let ranked = await rankDocumentsForDomain(tx, domain, query, limit);

  if (
    domain === "support" &&
    PLAN_PRICING_QUERY.test(query) &&
    !ranked.some((d) => d.filename === PLANS_RAG_FILENAME)
  ) {
    const plansDoc = await fetchSinglePolicyDoc(tx, PLANS_RAG_FILENAME);
    if (plansDoc) {
      ranked = [{ ...plansDoc, score: 999 }, ...ranked].slice(0, limit);
    }
  }

  if (ranked.length) return ranked;

  const config = getAiDomain(domain);
  const [salesDocs, policyDocs] = await Promise.all([
    fetchSalesDocs(tx, [...config.salesTableFiles]),
    fetchPolicyDocs(tx, [...config.policyTableFiles]),
  ]);

  return [...salesDocs, ...policyDocs]
    .slice(0, limit)
    .map((d) => ({ ...d, score: 0 }));
}

async function fetchDocsByFilenames(
  tx: TransactionSql,
  filenames: string[],
): Promise<RagDocChunk[]> {
  if (!filenames.length) return [];

  const salesNames = filenames.filter((f) => f === "Olready_Sales_Toolkit.md");
  const policyNames = filenames.filter((f) => f !== "Olready_Sales_Toolkit.md");

  const [salesDocs, policyDocs] = await Promise.all([
    fetchSalesDocs(tx, salesNames),
    fetchPolicyDocs(tx, policyNames),
  ]);

  const byFilename = new Map<string, RagDocChunk>();
  for (const d of [...salesDocs, ...policyDocs]) {
    byFilename.set(d.filename, { ...d, score: 100 });
  }

  return filenames
    .map((f) => byFilename.get(f))
    .filter((d): d is RagDocChunk => Boolean(d));
}

/** Public support RAG — topic + mode aware; extracts relevant sections, not doc headers only. */
export async function rankSupportPublicDocuments(
  tx: TransactionSql,
  query: string,
  limit = 5,
  mode: SupportChatMode = "mua_care",
): Promise<RagDocChunk[]> {
  const topic = detectSupportTopic(query, mode);
  const topicBoost = getTopicDocBoost(topic);

  if (isPlanPricingQuery(query)) {
    const plansDoc = await fetchSinglePolicyDoc(tx, PLANS_RAG_FILENAME);
    if (plansDoc) {
      // Prospects asking about plans — only public catalog, not legacy toolkit tiers
      if (mode === "mua_sales") {
        return [{ ...plansDoc, score: 999 }];
      }
      return [{ ...plansDoc, score: 999 }].slice(0, limit);
    }
  }

  const topicDocs = topicBoost.length
    ? await fetchDocsByFilenames(tx, topicBoost)
    : [];

  let ranked = await rankDocumentsForDomainWithFallback(tx, "support", query, limit);

  if (!ranked.length && !topicDocs.length) {
    ranked = await fetchDocsByFilenames(tx, SUPPORT_MODE_RAG_PRIORITY[mode].slice(0, limit));
  } else {
    const merged = new Map<string, RagDocChunk>();
    for (const d of [...topicDocs, ...ranked]) {
      if (!merged.has(d.filename)) merged.set(d.filename, d);
    }
    ranked = [...merged.values()];

    const priority = topicBoost.length ? topicBoost : SUPPORT_MODE_RAG_PRIORITY[mode];
    ranked = [...ranked].sort((a, b) => {
      const ai = priority.indexOf(a.filename);
      const bi = priority.indexOf(b.filename);
      const ap = ai === -1 ? 999 : ai;
      const bp = bi === -1 ? 999 : bi;
      if (ap !== bp) return ap - bp;
      return b.score - a.score;
    });
  }

  return ranked.slice(0, limit);
}

export function formatRagExcerpts(docs: RagDocChunk[], maxCharsPerDoc = 3500): string {
  if (!docs.length) return "";
  return docs
    .map(
      (d) =>
        `## ${d.title}${d.category ? ` (${d.category})` : ""}\n${d.contentText.slice(0, maxCharsPerDoc)}`,
    )
    .join("\n\n");
}

export function formatRagDocTitles(docs: RagDocChunk[]): string[] {
  return docs.map((d) => d.title);
}

/** @deprecated Use rankDocumentsForDomain with domain "support" or "grievance" */
export async function rankPolicyDocuments(
  tx: TransactionSql,
  query: string,
  limit = 5,
): Promise<
  { title: string; category: string | null; contentText: string; score: number }[]
> {
  const docs = await rankDocumentsForDomainWithFallback(tx, "support", query, limit);
  return docs.map(({ title, category, contentText, score }) => ({
    title,
    category,
    contentText,
    score,
  }));
}

/** @deprecated Use formatRagExcerpts */
export function formatPolicyExcerpts(
  docs: { title: string; category: string | null; contentText: string }[],
): string {
  return formatRagExcerpts(
    docs.map((d) => ({
      ...d,
      filename: d.title,
      score: 0,
      source: "policy" as const,
    })),
  );
}
