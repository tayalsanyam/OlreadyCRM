import type { AiMode } from "@/lib/ticket-ai";
import type { TicketContext } from "@/lib/ticket-context";
import { extractRagBulletFacts } from "@/lib/ai-reply-polish";

export function buildStructuredGrievanceFallback(input: {
  mode: AiMode;
  message: string;
  complaintText: string;
  category: string;
  context: TicketContext;
  docsBlock?: string;
}): string {
  const mua = input.context.mua?.name ?? "MUA";
  const ragFacts = extractRagBulletFacts(input.docsBlock ?? "", 3);
  const policy = ragFacts[0] ?? "Check signed plan terms and lead reversal policy before any commercial commitment.";

  switch (input.mode) {
    case "policy_helper": {
      const reversalAsked = /reversal|reverse|eligible|credit/i.test(
        `${input.complaintText} ${input.message} ${input.category}`,
      );
      return [
        reversalAsked
          ? "- Lead reversal eligibility: active plan at unlock, valid reason (already booked elsewhere, non-responsive, not looking, cancelled), and documented contact attempts per reversal policy."
          : `- ${policy}`,
        ragFacts[1] ? `- ${ragFacts[1]}` : "- Cite playbook section; check signed contract for plan-specific terms.",
        "- If CRM/ledger incomplete → holding acknowledgement only.",
      ].join("\n");
    }

    case "issue_analysis":
      return [
        `Policy: ${policy}`,
        "Strengths: CRM profile and plan on file available for review.",
        "Gaps: confirm lead ledger, push/unlock dates, and contact attempts.",
        "Next actions:",
        "1) Pull pushes and comms for complaint window",
        "2) Attach ledger if reversal-related",
        "3) Holding reply until records verified — no refund/reversal promise",
      ].join("\n");

    case "thread_absorption":
      return [
        "Timeline:",
        `- Complaint: ${input.complaintText.slice(0, 120)}${input.complaintText.length > 120 ? "…" : ""}`,
        "Facts vs allegations: verify against CRM pushes and comms.",
        "Missing: ledger, Callyzer/WhatsApp for date range if cited.",
        "Risk: repeat complaint / commercial commitment request — escalate if legal language.",
      ].join("\n");

    case "final_audit":
      return [
        "Per-lead audit requires attached ledger.",
        "Recommendation: holding until lead-wise eligibility checked against reversal policy.",
        "Do not promise MUA outcome.",
      ].join("\n");

    case "response_draft":
      return `Subject: Re: Your concern — ${mua}\nBody:\nHi ${mua.split(/\s+/)[0] ?? "there"},\n\nThank you for writing in. We are reviewing your concern against your plan records and will share a preliminary update within our standard SLA. If we need additional details, we will contact you.\n\nTeam Olready`;

    default:
      return [
        `Advisory for ${mua} (${input.mode}).`,
        `Category: ${input.category}.`,
        policy,
        "Complete CRM review before any commercial commitment.",
        input.message ? `Staff note: ${input.message}` : "",
      ]
        .filter(Boolean)
        .join("\n");
  }
}
