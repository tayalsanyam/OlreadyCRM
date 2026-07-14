import type { TransactionSql } from "@/db/index";
import { completeChatWithProviders } from "@/lib/ai-complete";
import { hasAnyLlmProvider } from "@/lib/ai-config";
import { getResolvedAiDomain } from "@/lib/ai-domain-config";
import { rankSupportPublicDocuments } from "@/lib/ai-rag";
import { formatRagDocTitles } from "@/lib/ai-rag";
import { sanitizePublicSupportText, buildUserPromptBlock } from "@/lib/ai-personas";
import {
  SUPPORT_CARE_ANSWER_RULES,
  SUPPORT_SALES_ANSWER_RULES,
} from "@/lib/support-answer-quality";
import type { SupportVisitorSegment } from "@/lib/support-chat-intake";
import { stripInstructionLeak } from "@/lib/ai-reply-polish";
import { buildStructuredSupportFallback } from "@/lib/support-fallback-reply";
import type { AiReplySource } from "@/lib/ai-reply-source";
import {
  buildSupportModeSystemPrompt,
  resolveSupportChatMode,
  type SupportChatMode,
} from "@/lib/support-chat-mode";
import {
  buildEscalationHint,
  buildPartnerContextBlock,
  buildTopicAnswerGuide,
} from "@/lib/support-public-facts";
import {
  buildProspectPlansTableFallback,
  isProspectPlanQuestion,
  PROSPECT_MUA_SALES_ANSWER_RULES,
} from "@/lib/plans-rag-public";
import { readPublicPlansRagMarkdown } from "@/lib/plans-rag-public.server";
import { SUPPORT_SUBMIT_CONCERN_HINT } from "@/lib/support-public-links";
import { formatSupportRagExcerpts } from "@/lib/support-rag-sections";
import {
  buildSignupHandoffReply,
  detectMuaSignupIntent,
  recordMuaSignupHandoff,
} from "@/lib/support-signup-handoff";

export type CareChatMessage = { role: "user" | "assistant"; content: string };

export async function runCarePublicChat(
  tx: TransactionSql,
  input: {
    message: string;
    history?: CareChatMessage[];
    visitorContext?: string;
    visitorName?: string;
    segment?: SupportVisitorSegment;
    contextSnapshot?: Record<string, unknown>;
    sessionId?: string;
  },
): Promise<{ reply: string; docTitles: string[]; replySource: AiReplySource }> {
  const domain = await getResolvedAiDomain(tx, "support");
  const visitorFirstName = input.visitorName?.trim().split(/\s+/)[0];
  const mode: SupportChatMode = input.segment
    ? resolveSupportChatMode(input.segment)
    : "mua_care";
  const sanitize = (text: string) => sanitizePublicSupportText(text, visitorFirstName);

  if (mode === "mua_sales" && detectMuaSignupIntent(input.message)) {
    let alreadyRecorded = false;
    if (input.sessionId) {
      const handoff = await recordMuaSignupHandoff(tx, input.sessionId, input.message);
      alreadyRecorded = handoff.alreadyRecorded;
    }
    return {
      reply: sanitize(buildSignupHandoffReply(visitorFirstName, alreadyRecorded)),
      docTitles: [],
      replySource: "handoff",
    };
  }

  const historyText = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const query = `${historyText}\n${input.message}`.trim();
  const planSalesTurn = mode === "mua_sales" && isProspectPlanQuestion(input.message, historyText);
  const plansCatalog = planSalesTurn ? readPublicPlansRagMarkdown() : "";

  const ranked = await rankSupportPublicDocuments(tx, query, planSalesTurn ? 1 : 4, mode);
  const docTitles = formatRagDocTitles(ranked);
  const docsBlock = planSalesTurn && plansCatalog
    ? plansCatalog
    : formatSupportRagExcerpts(ranked, query, mode, planSalesTurn ? 4500 : 2200);

  const partnerBlock =
    input.segment && input.contextSnapshot
      ? buildPartnerContextBlock(input.contextSnapshot, input.segment)
      : undefined;

  const answerRules =
    mode === "mua_sales" && planSalesTurn
      ? PROSPECT_MUA_SALES_ANSWER_RULES
      : mode === "mua_sales"
        ? SUPPORT_SALES_ANSWER_RULES
        : mode === "mua_care"
          ? SUPPORT_CARE_ANSWER_RULES
          : SUPPORT_SALES_ANSWER_RULES;

  const fallback = () =>
    planSalesTurn && mode === "mua_sales"
      ? buildProspectPlansTableFallback(visitorFirstName)
      : buildStructuredSupportFallback({
          mode,
          message: input.message,
          visitorFirstName,
          docsBlock,
          partnerActive: input.contextSnapshot?.activePlan === true,
        });

  if (!hasAnyLlmProvider()) {
    return { reply: sanitize(fallback()), docTitles, replySource: "fallback" };
  }

  const systemPrompt = [
    domain.systemPrompt,
    buildSupportModeSystemPrompt(mode),
    planSalesTurn
      ? "OVERRIDE: Ignore the 80-word and 3-bullet limits for this reply — prospect asked about plans/leads."
      : "",
    answerRules,
  ]
    .filter(Boolean)
    .join("\n\n");

  const userContent = buildUserPromptBlock({
    "Visitor context": input.visitorContext,
    "Partner record": partnerBlock,
    "How to answer this topic": buildTopicAnswerGuide(input.message, mode),
    "Escalation policy": `${buildEscalationHint(mode)} ${SUPPORT_SUBMIT_CONCERN_HINT}`,
    ...(planSalesTurn && plansCatalog
      ? {
          "Authoritative plan catalog — ONLY Prime, Pro, Phoenix (ignore all other tier names)":
            plansCatalog,
        }
      : {}),
    "Knowledge excerpts (use specific facts from here)": docsBlock
      || "No matching excerpts — say what you know at a high level and ask one clarifying question.",
    "Conversation so far": historyText || undefined,
    "User question": input.message,
  });

  const maxTokens = planSalesTurn ? 750 : domain.maxTokens;

  try {
    const { content: raw, source } = await completeChatWithProviders(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { temperature: domain.temperature, maxTokens },
    );

    const polished = stripInstructionLeak(raw);
    const reply = polished.trim() || fallback();
    const replySource: AiReplySource = polished.trim() ? source : "fallback";

    return { reply: sanitize(reply), docTitles, replySource };
  } catch {
    return { reply: sanitize(fallback()), docTitles, replySource: "fallback" };
  }
}
