import type { TicketSubmitterRow } from "@/lib/ticket-display";

export type TicketPartyContext = TicketSubmitterRow & {
  muaId?: string | null;
};

export function isBrideComplaintAgainstMua(row: TicketPartyContext): boolean {
  return row.raisedByType === "bride" && Boolean(row.muaId ?? row.muaName);
}

/** Who raised the ticket (complainant). */
export function ticketComplainantLabel(row: TicketSubmitterRow): string {
  if (row.raisedByType === "bride") {
    return row.brideName ?? row.raisedByName ?? "Bride";
  }
  if (row.raisedByType === "mua") {
    return row.muaName ?? row.raisedByName ?? "MUA";
  }
  return row.raisedByName ?? "Other";
}

/** MUA tagged on a bride complaint (subject of the grievance, not the submitter). */
export function ticketComplaintTargetLabel(row: TicketPartyContext): string | null {
  if (!isBrideComplaintAgainstMua(row)) return null;
  return row.muaName ?? "Tagged MUA";
}
