import type { TransactionSql } from "@/db/index";
import type { TicketContext } from "@/lib/ticket-context";
import { completeChatWithProviders } from "@/lib/ai-complete";
import { getResolvedAiDomain } from "@/lib/ai-domain-config";
import { buildUserPromptBlock, sanitizeAdvisorText } from "@/lib/ai-personas";
import {
  formatRagDocTitles,
  rankDocumentsForDomainWithFallback,
} from "@/lib/ai-rag";
import { formatFocusedRagExcerpts } from "@/lib/ai-rag-focused";
import {
  GRIEVANCE_AI_ANSWER_RULES,
  grievanceSectionHints,
} from "@/lib/ai-answer-quality";
import { hasAnyLlmProvider } from "@/lib/ai-config";
import { polishGrievanceReply, stripGrievancePromptLeak } from "@/lib/ai-reply-polish";
import { buildStructuredGrievanceFallback } from "@/lib/grievance-fallback-reply";

export type AiMode =
  | "triage"
  | "thread_absorption"
  | "issue_analysis"
  | "final_audit"
  | "policy_helper"
  | "response_draft";

export { stripGrievancePromptLeak };

function grievanceModeGuide(mode: AiMode): string {
  switch (mode) {
    case "triage":
      return `Output: valid JSON only — category, urgency, tags[], suggestedPlan[] (max 4 CRM-first steps). No prose.`;
    case "thread_absorption":
      return `Output: (1) Timeline in 3-5 bullets (2) Facts vs allegations (3) Missing CRM data (4) Risk flags. Max 150 words.`;
    case "issue_analysis":
      return `Output: (1) Policy position in 1 sentence (2) Strengths/weaknesses vs records — 2 bullets each (3) Next 3 actions for care agent.`;
    case "final_audit":
      return `Output: Per-lead: eligible Y/N + reason from policy. End with overall recommendation: holding | preliminary | final — no promise to MUA.`;
    case "policy_helper":
      return `Output: Direct policy answer in 2-4 bullets citing doc section. If plan-specific, note "check signed contract".`;
    case "response_draft":
      return `Output EXACTLY:
Subject: <one line>
Body:
<email to MUA, plain language, Team Olready sign-off, max 120 words>`;
  }
}

function fallbackTriage(input: {
  complaintText: string;
  category: string;
  context: TicketContext;
}): Record<string, unknown> {
  const text = input.complaintText.toLowerCase();
  let category = input.category || "other";
  let urgency: "high" | "medium" | "low" = "medium";
  const tags: string[] = [];

  if (/reversal|reverse|credit|refund/.test(text)) {
    category = "lead_reversal";
    tags.push("ledger-required");
  } else if (/extension|extend plan/.test(text)) {
    category = "plan_extension";
    tags.push("plan-related");
  } else if (/invoice|contract|payment|bill/.test(text)) {
    category = "invoice_contract";
  } else if (/rm|relationship manager|unresponsive rm/.test(text)) {
    category = "rm_relationship";
    urgency = "high";
  }

  if (/legal|lawyer|court|consumer forum/.test(text)) {
    tags.push("legal-risk");
    urgency = "high";
  }

  return {
    category,
    urgency,
    tags,
    suggestedPlan: [
      "Review CRM context tabs (MUA profile, pushes, comms, activation)",
      "Attach lead usage ledger if category requires",
      "Pull Callyzer + WhatsApp for relevant date range",
      "Assign RM/Sales task only if data gap flagged after CRM review",
    ],
    muaLinked: Boolean(input.context.mua),
    openTickets: input.context.openTicketCount,
  };
}

export function parseEmailDraft(text: string): { subject: string; body: string } | null {
  const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
  const bodyMatch = text.match(/(?:^Body:\s*\n?|^Email:\s*\n?)([\s\S]+)$/im);
  if (subjectMatch && bodyMatch) {
    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
    };
  }
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length >= 2 && lines[0].toLowerCase().startsWith("subject:")) {
    return {
      subject: lines[0].replace(/^subject:\s*/i, "").trim(),
      body: lines.slice(1).join("\n").replace(/^body:\s*/i, "").trim(),
    };
  }
  return null;
}

function grievanceFallback(input: {
  mode: AiMode;
  message: string;
  complaintText: string;
  category: string;
  context: TicketContext;
  docsBlock: string;
}): string {
  return sanitizeAdvisorText(
    buildStructuredGrievanceFallback({
      mode: input.mode,
      message: input.message,
      complaintText: input.complaintText,
      category: input.category,
      context: input.context,
      docsBlock: input.docsBlock,
    }),
  );
}

export async function runTicketAi(
  tx: TransactionSql,
  input: {
    mode: AiMode;
    message?: string;
    complaintText: string;
    category: string;
    context: TicketContext;
  },
): Promise<{
  response: string;
  triage?: Record<string, unknown>;
  docTitles: string[];
  emailDraft?: { subject: string; body: string };
}> {
  const docs = await rankDocumentsForDomainWithFallback(
    tx,
    "grievance",
    `${input.complaintText} ${input.message ?? ""} ${input.category}`,
    5,
  );
  const docTitles = formatRagDocTitles(docs);

  if (input.mode === "triage") {
    const triage = fallbackTriage(input);
    return {
      response: sanitizeAdvisorText(JSON.stringify(triage, null, 2)),
      triage,
      docTitles,
    };
  }

  const domain = await getResolvedAiDomain(tx, "grievance");
  const docsBlock = formatFocusedRagExcerpts(docs, `${input.complaintText} ${input.message ?? ""}`, {
    sectionHints: grievanceSectionHints(input.category, input.complaintText),
    docBoost: [
      "Olready_MUA_Issue_Advisor_Knowledge_Playbook (1).md",
      "Olready_Master_Knowledge_Dump_No_Pricing.md",
    ],
    maxCharsPerDoc: 2800,
  });

  const staffMessage = input.message ?? "";
  const fallback = () =>
    grievanceFallback({
      mode: input.mode,
      message: staffMessage,
      complaintText: input.complaintText,
      category: input.category,
      context: input.context,
      docsBlock,
    });

  const emailDraftFrom = (text: string) =>
    input.mode === "response_draft" ? parseEmailDraft(text) ?? undefined : undefined;

  if (!hasAnyLlmProvider()) {
    const response = fallback();
    return { response, docTitles, emailDraft: emailDraftFrom(response) };
  }

  const systemPrompt = [
    domain.systemPrompt,
    GRIEVANCE_AI_ANSWER_RULES,
    grievanceModeGuide(input.mode),
  ].join("\n\n");

  const userContent = buildUserPromptBlock({
    Mode: input.mode,
    Category: input.category,
    Complaint: input.complaintText,
    "Staff note": input.message,
    "CRM context": JSON.stringify(input.context, null, 2),
    "Policy excerpts": docsBlock || undefined,
  });

  try {
    const content = polishGrievanceReply(
      sanitizeAdvisorText(
        (
          await completeChatWithProviders(
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            { temperature: domain.temperature, maxTokens: domain.maxTokens },
          )
        ).content,
      ),
      input.mode,
    );

    const response = content.trim() || fallback();
    const emailDraft = emailDraftFrom(response);

    return { response, docTitles, emailDraft };
  } catch {
    const response = fallback();
    return { response, docTitles, emailDraft: emailDraftFrom(response) };
  }
}
