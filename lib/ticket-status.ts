import type { RaisedByType, TicketStatus } from "@/lib/types";

/** All stages in lifecycle order (kanban / filters). */
export const TICKET_STATUS_ORDER: TicketStatus[] = [
  "received",
  "investigating",
  "awaitingInfo",
  "initialReplySent",
  "inDiscussion",
  "finalOffer",
  "resolutionProposed",
  "closed",
];

export const TICKET_STATUS_TO_DB: Record<TicketStatus, string> = {
  received: "received",
  investigating: "investigating",
  awaitingInfo: "awaiting_info",
  initialReplySent: "initial_reply_sent",
  inDiscussion: "in_discussion",
  finalOffer: "final_offer",
  resolutionProposed: "resolution_proposed",
  closed: "closed",
};

const TICKET_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(TICKET_STATUS_TO_DB).map(([k, v]) => [v, k])
) as Record<string, TicketStatus>;

/** Map pre-v2 DB values for reads during rollout. */
const LEGACY_TICKET_STATUS_FROM_DB: Record<string, TicketStatus> = {
  open: "received",
  in_investigation: "investigating",
  pending_compilation: "investigating",
  pending_approval: "investigating",
  revision_requested: "investigating",
  approved: "initialReplySent",
  closed: "closed",
};

export const TICKET_STATUS_LABEL: Record<string, string> = {
  received: "Received",
  investigating: "Investigating",
  awaiting_info: "Awaiting info",
  awaitingInfo: "Awaiting info",
  initial_reply_sent: "Initial reply sent",
  initialReplySent: "Initial reply sent",
  in_discussion: "In discussion",
  inDiscussion: "In discussion",
  final_offer: "Final offer",
  finalOffer: "Final offer",
  resolution_proposed: "Resolution proposed",
  resolutionProposed: "Resolution proposed",
  closed: "Closed",
};

export function toDbTicketStatus(status: TicketStatus): string {
  return TICKET_STATUS_TO_DB[status];
}

export function fromDbTicketStatus(status: string): TicketStatus {
  if (TICKET_STATUS_FROM_DB[status]) return TICKET_STATUS_FROM_DB[status];
  if (LEGACY_TICKET_STATUS_FROM_DB[status]) return LEGACY_TICKET_STATUS_FROM_DB[status];
  return "received";
}

export function normalizeTicketStatusKey(status: string): TicketStatus {
  if (status.includes("_")) return fromDbTicketStatus(status);
  return (TICKET_STATUS_LABEL[status] ? (status as TicketStatus) : fromDbTicketStatus(status));
}

export function ticketStatusesForParty(raisedByType: RaisedByType | string): TicketStatus[] {
  const shared: TicketStatus[] = [
    "received",
    "investigating",
    "awaitingInfo",
    "initialReplySent",
    "inDiscussion",
  ];
  if (raisedByType === "mua") {
    return [...shared, "finalOffer", "closed"];
  }
  return [...shared, "resolutionProposed", "closed"];
}

export function ticketStatusLabel(status: string, raisedByType?: RaisedByType | string): string {
  const key = normalizeTicketStatusKey(status);
  if (key === "finalOffer" || key === "resolutionProposed") {
    return TICKET_STATUS_LABEL[key] ?? key;
  }
  return TICKET_STATUS_LABEL[key] ?? TICKET_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

export const CLOSED_TICKET_DB_STATUSES = ["closed"] as const;

export function isOpenTicketStatus(status: string): boolean {
  return !CLOSED_TICKET_DB_STATUSES.includes(status as (typeof CLOSED_TICKET_DB_STATUSES)[number]);
}

/** Follow-up date required when moving to a non-terminal stage. */
export function statusRequiresNextFollowUp(status: TicketStatus): boolean {
  return status !== "closed";
}

export function resolutionStageForParty(
  raisedByType: RaisedByType | string
): "finalOffer" | "resolutionProposed" {
  return raisedByType === "mua" ? "finalOffer" : "resolutionProposed";
}
