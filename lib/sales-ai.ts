import type { TransactionSql } from "@/db/index";
import { completeChatWithProviders } from "@/lib/ai-complete";
import { hasAnyLlmProvider } from "@/lib/ai-config";
import type { ChatMessage } from "@/lib/ai-openai";
import { getResolvedAiDomain } from "@/lib/ai-domain-config";
import { buildUserPromptBlock } from "@/lib/ai-personas";
import {
  formatRagDocTitles,
  rankDocumentsForDomainWithFallback,
} from "@/lib/ai-rag";
import { formatFocusedRagExcerpts } from "@/lib/ai-rag-focused";
import { muaFirstName, polishSalesReply } from "@/lib/ai-reply-polish";
import { buildStructuredSalesFallback } from "@/lib/sales-fallback-reply";
import {
  SALES_AI_ANSWER_RULES,
  salesSectionHints,
  salesTaskGuide,
} from "@/lib/ai-answer-quality";

type PipelineRow = {
  id: string;
  stage: string;
  muaType: string | null;
  updatedAt: string;
  muaId: string;
  muaName: string;
  muaCity: string | null;
  muaPhone: string | null;
  muaSource: string | null;
  plan: string | null;
  leadCap: number | null;
  avgRevenueTarget: number | null;
  regions: string[] | null;
  cities: string[] | null;
  trainingProfileLink: string | null;
  trainingComplete: boolean | null;
  profileVerified: boolean | null;
  invoiceGenerated: boolean | null;
  contractGenerated: boolean | null;
};

function salesFallback(input: {
  message: string;
  pipeline: PipelineRow | null;
  docsBlock: string;
}): string {
  return buildStructuredSalesFallback({
    message: input.message,
    muaName: input.pipeline?.muaName,
    muaCity: input.pipeline?.muaCity,
    stage: input.pipeline?.stage,
    docsBlock: input.docsBlock,
  });
}

export async function runSalesAiChat(
  tx: TransactionSql,
  input: {
    message: string;
    pipelineId?: string;
    history?: ChatMessage[];
  },
): Promise<{
  reply: string;
  pipeline: PipelineRow | null;
  hasPipelineDetails: boolean;
  recentCommsCount: number;
  usedDocs: string[];
}> {
  const domain = await getResolvedAiDomain(tx, "sales");
  const ranked = await rankDocumentsForDomainWithFallback(tx, "sales", input.message, 5);
  const usedDocs = formatRagDocTitles(ranked);
  const hints = salesSectionHints(input.message);
  const docsBlock = formatFocusedRagExcerpts(ranked, input.message, {
    sectionHints: hints,
    docBoost: ["Olready_Sales_Toolkit.md"],
    maxCharsPerDoc: 1800,
  });

  let pipeline: PipelineRow | null = null;
  let recentComms: { source: string; entryType: string; description: string; createdAt: string }[] =
    [];

  if (input.pipelineId) {
    const [p] = await tx<PipelineRow[]>`
      SELECT
        p.id, p.stage, p.mua_type AS "muaType", p.updated_at AS "updatedAt",
        m.id AS "muaId", m.name AS "muaName", m.city AS "muaCity", m.phone AS "muaPhone", m.source AS "muaSource",
        o.plan, o.lead_cap AS "leadCap", o.avg_revenue_target AS "avgRevenueTarget", o.regions, o.cities,
        t.profile_link AS "trainingProfileLink", t.complete AS "trainingComplete",
        al.profile_link_verified AS "profileVerified", al.invoice_generated AS "invoiceGenerated", al.contract_generated AS "contractGenerated"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
      LEFT JOIN sales.training t ON t.pipeline_id = p.id
      LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
      WHERE p.id = ${input.pipelineId}::uuid
    `;
    pipeline = p ?? null;

    if (pipeline?.muaId) {
      const salesComms = await tx`
        SELECT 'sales'::text AS source, entry_type AS "entryType", description, created_at AS "createdAt"
        FROM sales.comms_log
        WHERE pipeline_id = ${input.pipelineId}::uuid
        ORDER BY created_at DESC
        LIMIT 10
      `;
      const rmComms = await tx`
        SELECT 'rm'::text AS source, entry_type AS "entryType", description, created_at AS "createdAt"
        FROM comms
        WHERE mua_id = ${pipeline.muaId}::uuid
        ORDER BY created_at DESC
        LIMIT 10
      `;
      recentComms = [...salesComms, ...rmComms]
        .sort(
          (a: { createdAt: string }, b: { createdAt: string }) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 15);
    }
  }

  const conversation = (input.history ?? []).slice(-8);
  const fallback = () => salesFallback({ message: input.message, pipeline, docsBlock });

  if (!hasAnyLlmProvider()) {
    return {
      reply: fallback(),
      pipeline,
      hasPipelineDetails: Boolean(pipeline),
      recentCommsCount: recentComms.length,
      usedDocs,
    };
  }

  const userContent = buildUserPromptBlock({
    Task: salesTaskGuide(input.message, pipeline?.stage, pipeline?.muaName),
    "Answer quality": SALES_AI_ANSWER_RULES,
    "MUA for outbound drafts": pipeline?.muaName
      ? `Full name: ${pipeline.muaName}. Use first name "${muaFirstName(pipeline.muaName)}" in WhatsApp/SMS/email — no placeholders.`
      : undefined,
    "Sales Toolkit excerpts": docsBlock || "No toolkit excerpts matched.",
    "Pipeline summary": pipeline
      ? JSON.stringify(
          {
            muaName: pipeline.muaName,
            muaCity: pipeline.muaCity,
            muaType: pipeline.muaType,
            stage: pipeline.stage,
            plan: pipeline.plan,
            leadCap: pipeline.leadCap,
            regions: pipeline.regions,
            cities: pipeline.cities,
            trainingComplete: pipeline.trainingComplete,
            profileVerified: pipeline.profileVerified,
          },
          null,
          2,
        )
      : undefined,
    "Recent communication ledger": recentComms.length
      ? JSON.stringify(recentComms, null, 2)
      : undefined,
    Question: input.message,
  });

  try {
    const messages: ChatMessage[] = [
      { role: "system", content: domain.systemPrompt },
      ...conversation.filter((m) => m.role === "user" || m.role === "assistant"),
      { role: "user", content: userContent },
    ];

    const reply = polishSalesReply(
      (
        await completeChatWithProviders(messages, {
          temperature: domain.temperature,
          maxTokens: domain.maxTokens,
        })
      ).content,
      pipeline?.muaName,
    );

    return {
      reply: reply.trim() || fallback(),
      pipeline,
      hasPipelineDetails: Boolean(pipeline),
      recentCommsCount: recentComms.length,
      usedDocs,
    };
  } catch {
    return {
      reply: fallback(),
      pipeline,
      hasPipelineDetails: Boolean(pipeline),
      recentCommsCount: recentComms.length,
      usedDocs,
    };
  }
}
