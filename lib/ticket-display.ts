export type TicketSubmitterRow = {
  raisedByType: string;
  raisedByName: string | null;
  muaName: string | null;
  brideName: string | null;
  leadDisplayId: string | null;
};

export function raisedByTypeLabel(type: string): string {
  if (type === "bride") return "Bride";
  if (type === "mua") return "MUA";
  if (type === "other") return "Other";
  return type;
}

export function ticketSubmitterLabel(row: TicketSubmitterRow): string {
  if (row.raisedByType === "bride") {
    const name = row.brideName ?? row.raisedByName;
    if (name && row.leadDisplayId) return `${name} (${row.leadDisplayId})`;
    return name ?? "Bride (unlinked)";
  }
  if (row.raisedByType === "mua") {
    return row.muaName ?? row.raisedByName ?? "MUA (unlinked)";
  }
  return row.raisedByName ?? "Other";
}
