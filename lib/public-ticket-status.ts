import { fromDbTicketStatus, ticketStatusLabel } from "@/lib/ticket-status";

/** Current status shown in ticket details (present tense, professional). */
export const PUBLIC_TICKET_STATUS: Record<string, string> = {
  received: "Received",
  investigating: "Under review",
  awaiting_info: "We need more information from you",
  awaitingInfo: "We need more information from you",
  initial_reply_sent: "We're in touch with you",
  initialReplySent: "We're in touch with you",
  in_discussion: "We're in touch with you",
  inDiscussion: "We're in touch with you",
  final_offer: "Resolution proposed",
  finalOffer: "Resolution proposed",
  resolution_proposed: "Resolution proposed",
  resolutionProposed: "Resolution proposed",
  closed: "Closed",
};

export function publicTicketStatusLabel(status: string): string {
  const key = fromDbTicketStatus(status);
  return PUBLIC_TICKET_STATUS[key] ?? PUBLIC_TICKET_STATUS[status] ?? ticketStatusLabel(status);
}

export function formatPublicTicketCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type PublicTicketLookupResult = {
  ticketNumber: string;
  status: string;
  statusLabel: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  slaDueAt: string | null;
  activity: PublicTicketActivity[];
  nextStep: string | null;
};

export type PublicTicketActivity = {
  at: string;
  label: string;
};

/** Past-tense milestones for the updates timeline. */
export const PUBLIC_TIMELINE_ACTIVITY: Record<string, string> = {
  received: "Concern received",
  investigating: "Review commenced",
  awaiting_info: "We requested more information",
  awaitingInfo: "We requested more information",
  initial_reply_sent: "Initial reply sent",
  initialReplySent: "Initial reply sent",
  in_discussion: "Discussion in progress",
  inDiscussion: "Discussion in progress",
  final_offer: "Resolution proposed",
  finalOffer: "Resolution proposed",
  resolution_proposed: "Resolution proposed",
  resolutionProposed: "Resolution proposed",
  closed: "Case closed",
};

export const PUBLIC_ESCALATION_ACTIVITY: Record<number, string> = {
  2: "Escalated to senior care",
  3: "Under senior review",
};

export function publicTicketNextStep(status: string): string | null {
  const key = fromDbTicketStatus(status);
  if (key === "closed") {
    return "This case is closed. If you need further assistance, please submit a new concern.";
  }
  if (key === "received") {
    return "Our care team will review your submission and contact you by email if we need any further information.";
  }
  if (key === "investigating") {
    return "We are reviewing your concern. No action is required from you unless we request additional details.";
  }
  if (key === "awaitingInfo") {
    return "Please reply to our email with the information we requested so we can continue reviewing your case.";
  }
  if (key === "initialReplySent" || key === "inDiscussion") {
    return "We are in touch with you by email. Reply to our care address if you have more to share.";
  }
  if (key === "finalOffer" || key === "resolutionProposed") {
    return "We have proposed a resolution. Please check your email and let us know if you accept or need further discussion.";
  }
  return "Our team is working on your case and will contact you by email if required.";
}
