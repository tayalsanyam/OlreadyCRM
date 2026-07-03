import type { TransactionSql } from "@/db/index";
import { completeChatWithProviders } from "@/lib/ai-complete";
import { hasAnyLlmProvider } from "@/lib/ai-config";
import { getResolvedAiDomain } from "@/lib/ai-domain-config";
import { buildUserPromptBlock, sanitizeAdvisorText } from "@/lib/ai-personas";
import {
  formatRagDocTitles,
  rankDocumentsForDomainWithFallback,
} from "@/lib/ai-rag";
import { formatFocusedRagExcerpts } from "@/lib/ai-rag-focused";
import { polishRmReply } from "@/lib/ai-reply-polish";
import { buildStructuredRmFallback } from "@/lib/rm-fallback-reply";
import {
  RM_AI_ANSWER_RULES,
  rmContextGuide,
  rmSectionHints,
} from "@/lib/ai-answer-quality";

type LeadRow = {
  brideName: string;
  city: string;
  region: string;
  status: string;
};

export async function runRmAiAssist(
  tx: TransactionSql,
  input: {
    message: string;
    context?: "verification" | "makeup" | "general";
    lead?: LeadRow | null;
    leadContextBlock?: string;
  },
): Promise<{ reply: string; docNames: string[] }> {
  const domain = await getResolvedAiDomain(tx, "rm");
  const ctx = input.context ?? "general";
  const query = `${ctx} ${input.message} ${input.lead?.brideName ?? ""} ${input.leadContextBlock?.slice(0, 400) ?? ""}`;

  const ranked = await rankDocumentsForDomainWithFallback(tx, "rm", query, 5);
  const docNames = formatRagDocTitles(ranked);
  const docsBlock = formatFocusedRagExcerpts(ranked, query, {
    sectionHints: rmSectionHints(ctx, input.message),
    docBoost: [
      "Olready_Bride_Side_Knowledge_Bank_RAG.md",
      "Olready_Master_Knowledge_Dump_No_Pricing.md",
    ],
    maxCharsPerDoc: 2000,
  });

  const fallback = () =>
    buildStructuredRmFallback({
      message: input.message,
      context: ctx,
      lead: input.lead ?? null,
      leadContextBlock: input.leadContextBlock,
      docsBlock,
    });

  if (!hasAnyLlmProvider()) {
    return { reply: fallback(), docNames };
  }

  const userContent = buildUserPromptBlock({
    "Context mode": ctx,
    Task: rmContextGuide(ctx),
    "Answer quality": RM_AI_ANSWER_RULES,
    "Lead context":
      input.leadContextBlock?.trim() ||
      (input.lead
        ? `${input.lead.brideName} | ${input.lead.city} | ${input.lead.region} | status: ${input.lead.status}`
        : undefined),
    "Knowledge excerpts": docsBlock || undefined,
    Question: input.message,
  });

  try {
    const reply = polishRmReply(
      sanitizeAdvisorText(
        (
          await completeChatWithProviders(
            [
              { role: "system", content: domain.systemPrompt },
              { role: "user", content: userContent },
            ],
            { temperature: domain.temperature, maxTokens: domain.maxTokens },
          )
        ).content,
      ),
    );

    return { reply: reply.trim() || fallback(), docNames };
  } catch {
    return { reply: fallback(), docNames };
  }
}
