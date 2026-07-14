type TicketForTemplate = {
  ticketNumber: string;
  muaName?: string | null;
  brideName?: string | null;
  raisedByName?: string | null;
};

export function ticketEmailTemplateVars(
  ticket: TicketForTemplate,
  overrides?: { next_steps?: string; resolution?: string },
): Record<string, string> {
  const partyName =
    ticket.muaName ?? ticket.brideName ?? ticket.raisedByName ?? "there";
  return {
    ticket_number: ticket.ticketNumber,
    mua_name: ticket.muaName ?? ticket.raisedByName ?? "there",
    bride_name: ticket.brideName ?? ticket.raisedByName ?? "there",
    party_name: partyName,
    next_steps: overrides?.next_steps ?? "",
    resolution: overrides?.resolution ?? "",
  };
}
