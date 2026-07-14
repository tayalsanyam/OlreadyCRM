import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { FEEDBACK_NEGATIVE_REASONS } from "@/lib/feedback-constants";
import { createTicket } from "@/lib/ticket-create";
import { COMM } from "@/lib/comm-types";
import type { FeedbackServiceSentiment } from "@/lib/types";

type NegativeFeedbackBody = {
  serviceSentiment?: FeedbackServiceSentiment | null;
  negativeReasons?: string[];
  negativeReasonOther?: string | null;
  improvementsNote?: string | null;
  olreadyRating?: number | null;
  muaRating?: number | null;
  olreadyMuaId?: string | null;
};

const REASON_TO_CATEGORY: Record<string, string> = {
  too_many_calls: "too_many_calls",
  budget_issues: "other",
  poor_communication: "rm_unresponsive",
  no_mua_contact: "no_contact_from_muas",
  other: "other",
};

function buildComplaintText(
  body: NegativeFeedbackBody,
  brideName: string,
  feedbackId: string
): string {
  const labels = new Map(FEEDBACK_NEGATIVE_REASONS.map((r) => [r.value, r.label]));
  const reasons = (body.negativeReasons ?? [])
    .map((r) => labels.get(r as (typeof FEEDBACK_NEGATIVE_REASONS)[number]["value"]) ?? r)
    .join("; ");
  const parts = [
    `Post-event feedback (${brideName}) — negative experience reported by feedback RM.`,
    reasons ? `Issues: ${reasons}.` : null,
    body.negativeReasonOther?.trim()
      ? `Details: ${body.negativeReasonOther.trim()}`
      : null,
    body.improvementsNote?.trim()
      ? `Improvements: ${body.improvementsNote.trim()}`
      : null,
    body.olreadyRating != null ? `Olready rating: ${body.olreadyRating}/5.` : null,
    body.muaRating != null ? `MUA rating: ${body.muaRating}/5.` : null,
    `Feedback record: ${feedbackId}`,
  ];
  return parts.filter(Boolean).join("\n");
}

/** Auto-raise a bride care ticket when feedback sentiment is negative. */
export async function createCareTicketFromNegativeFeedback(
  tx: TransactionSql,
  leadId: string,
  staffId: string,
  feedbackId: string,
  body: NegativeFeedbackBody
): Promise<string | null> {
  if (body.serviceSentiment !== "negative") return null;

  const [lead] = await tx<{
    brideName: string;
    phone: string | null;
    email: string | null;
  }[]>`
    SELECT bride_name AS "brideName", phone, email
    FROM bride_leads WHERE id = ${leadId}::uuid
  `;
  if (!lead) return null;

  const primaryCategory =
    REASON_TO_CATEGORY[body.negativeReasons?.[0] ?? ""] ?? "other";
  const categories = [
    ...new Set([
      primaryCategory,
      ...(body.negativeReasons ?? []).map((r) => REASON_TO_CATEGORY[r] ?? "other"),
    ]),
  ];

  const ticket = await createTicket(tx, {
    categories,
    complaintText: buildComplaintText(body, lead.brideName, feedbackId),
    raisedByName: lead.brideName,
    raisedByPhone: lead.phone,
    raisedByEmail: lead.email,
    raisedByType: "bride",
    source: "feedbackIntake",
    leadId,
    muaId: body.olreadyMuaId ?? null,
    createdBy: staffId,
    sendAck: false,
  });

  await appendComm(tx, {
    leadId,
    entryType: COMM.careTicketCreated,
    description: `Care ticket ${ticket.ticketNumber} auto-raised from negative post-event feedback`,
    actorId: staffId,
    metadata: { ticketId: ticket.id, feedbackId },
  });

  return ticket.id;
}
