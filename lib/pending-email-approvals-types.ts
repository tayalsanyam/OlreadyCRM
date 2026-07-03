export type PendingEmailApprovalRow = {
  emailId: string;
  subject: string;
  bodyHtml: string;
  toEmail: string;
  approvalTier: number;
  createdAt: string;
  attachmentIds: string[];
  ticketId: string;
  ticketNumber: string;
  ticketStatus: string;
  category: string;
  raisedByType: string;
  raisedByName: string | null;
  muaName: string | null;
  brideName: string | null;
  createdByName: string | null;
  complaintText: string | null;
  urgency: string;
  slaDueAt: string | null;
  slaBreached: boolean;
};

export function isPendingEmailDueSoon(slaDueAt: string | null, slaBreached: boolean): boolean {
  if (slaBreached) return true;
  if (!slaDueAt) return false;
  const dueMs = new Date(slaDueAt).getTime();
  if (Number.isNaN(dueMs)) return false;
  return dueMs - Date.now() <= 24 * 60 * 60 * 1000;
}

export function pendingEmailUrgencyRank(urgency: string): number {
  if (urgency === "high") return 0;
  if (urgency === "medium") return 1;
  return 2;
}

/** Complainant on the ticket — not the linked MUA on bride/other tickets. */
export function pendingEmailPartyLabel(row: {
  raisedByType: string;
  raisedByName: string | null;
  muaName: string | null;
  brideName: string | null;
}): string {
  if (row.raisedByType === "bride") {
    const complainant = row.brideName ?? row.raisedByName ?? "Bride";
    if (row.muaName) return `${complainant} · re: ${row.muaName}`;
    return complainant;
  }
  if (row.raisedByType === "mua") {
    return row.muaName ?? row.raisedByName ?? "MUA";
  }
  return row.raisedByName ?? "Other";
}
