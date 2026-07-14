import { TICKET_CATEGORY_LABELS } from "@/lib/ticket-categories";

/** Visible ticket token — keeps CRM + Gmail subject threading aligned without Gmail API. */
export function ticketEmailThreadToken(ticketNumber: string): string {
  return `[Olready #${ticketNumber}]`;
}

export function ticketConcernLabel(opts: {
  complaintText?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): string {
  if (opts.category) {
    const label =
      TICKET_CATEGORY_LABELS[opts.category] ?? opts.category.replace(/_/g, " ");
    if (opts.category !== "other") return label;
    if (opts.subcategory?.trim()) {
      const sub = opts.subcategory.trim();
      return sub.length > 60 ? `${sub.slice(0, 57)}…` : sub;
    }
    return label;
  }
  return "Support concern";
}

/** Stable subject for a ticket — token + concern (not stage/template-specific). */
export function ticketStableEmailSubject(ticketNumber: string, concern: string): string {
  const token = ticketEmailThreadToken(ticketNumber);
  const tail = concern.trim();
  return tail ? `${token} ${tail}` : token;
}
/** Prefix subject once so replies in Gmail stay on the same thread. */
export function ensureTicketThreadSubject(ticketNumber: string, subject: string): string {
  const token = ticketEmailThreadToken(ticketNumber);
  let trimmed = subject.trim();
  if (!trimmed) return token;

  // Drop trailing duplicate ticket ref when thread token is prefixed (e.g. "… — GK-0001").
  const tailPatterns = [
    new RegExp(`\\s*[—–-]\\s*${escapeRegExp(ticketNumber)}\\s*$`, "i"),
    new RegExp(`\\s*${escapeRegExp(ticketNumber)}\\s*$`, "i"),
    /\s*[—–-]\s*\{\{ticket_number\}\}\s*$/i,
  ];
  for (const pattern of tailPatterns) {
    trimmed = trimmed.replace(pattern, "").trim();
  }

  if (trimmed.startsWith(token)) return trimmed;
  return trimmed ? `${token} ${trimmed}` : token;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Subject line without the ticket thread prefix (for editing the tail only). */
export function stripTicketThreadSubject(ticketNumber: string, subject: string): string {
  const token = ticketEmailThreadToken(ticketNumber);
  const trimmed = subject.trim();
  if (!trimmed.startsWith(token)) return trimmed;
  return trimmed.slice(token.length).trim();
}

export type TicketEmailThreadHeaders = {
  inReplyTo: string | null;
  references: string[];
};

/** Resend / RFC threading headers from prior sends on this ticket. */
export function buildResendThreadHeaders(
  priorMessageIds: string[],
): TicketEmailThreadHeaders | null {
  const ids = priorMessageIds.filter(Boolean);
  if (!ids.length) return null;
  const last = ids[ids.length - 1]!;
  const formatted = ids.map((id) => (id.startsWith("<") ? id : `<${id}@resend.dev>`));
  return {
    inReplyTo: formatted[formatted.length - 1]!,
    references: formatted,
  };
}
