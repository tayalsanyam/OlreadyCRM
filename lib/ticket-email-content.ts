import { ensureTicketThreadSubject } from "@/lib/ticket-email-thread";

/** Appended communication log — excluded from admin approval comparison. */
export const TICKET_EMAIL_COMM_APPENDIX_MARKER =
  "\n\n--- Ticket communication log (reference) ---\n";

export function splitEmailBodyCoreAndAppendix(bodyHtml: string): {
  core: string;
  appendix: string | null;
} {
  const idx = bodyHtml.indexOf(TICKET_EMAIL_COMM_APPENDIX_MARKER);
  if (idx === -1) return { core: bodyHtml, appendix: null };
  return {
    core: bodyHtml.slice(0, idx),
    appendix: bodyHtml.slice(idx + TICKET_EMAIL_COMM_APPENDIX_MARKER.length),
  };
}

export function normalizeEmailBody(body: string): string {
  return body.replace(/\r\n/g, "\n").trim();
}

export function normalizeEmailFields(opts: {
  ticketNumber: string;
  subject: string;
  bodyHtml: string;
  toEmail: string;
}): { subject: string; bodyCore: string; toEmail: string } {
  const { core } = splitEmailBodyCoreAndAppendix(opts.bodyHtml);
  return {
    subject: ensureTicketThreadSubject(opts.ticketNumber, opts.subject.trim()),
    bodyCore: normalizeEmailBody(core),
    toEmail: opts.toEmail.trim().toLowerCase(),
  };
}

export function approvedCoreContentMatches(
  ticketNumber: string,
  approved: {
    approvedSubject?: string | null;
    approvedBodyHtml?: string | null;
    approvedToEmail?: string | null;
    subject?: string;
    bodyHtml?: string;
    toEmail?: string;
  },
  current: { subject: string; bodyHtml: string; toEmail: string }
): boolean {
  const snapSubject = approved.approvedSubject ?? approved.subject ?? "";
  const snapBody = approved.approvedBodyHtml ?? approved.bodyHtml ?? "";
  const snapTo = approved.approvedToEmail ?? approved.toEmail ?? "";

  const a = normalizeEmailFields({
    ticketNumber,
    subject: snapSubject,
    bodyHtml: snapBody,
    toEmail: snapTo,
  });
  const b = normalizeEmailFields({
    ticketNumber,
    subject: current.subject,
    bodyHtml: current.bodyHtml,
    toEmail: current.toEmail,
  });

  return a.subject === b.subject && a.bodyCore === b.bodyCore && a.toEmail === b.toEmail;
}

export function appendCommunicationLog(
  bodyHtml: string,
  entries: { label: string; text: string }[]
): string {
  if (!entries.length) return bodyHtml;
  const { core } = splitEmailBodyCoreAndAppendix(bodyHtml);
  const lines = entries.map((e) => `[${e.label}]\n${e.text.trim()}`).join("\n\n");
  return `${core.trim()}${TICKET_EMAIL_COMM_APPENDIX_MARKER}${lines}`;
}

export function formatCommunicationAppendEntry(row: {
  createdAt: string;
  channel: string;
  direction: string;
  subject?: string | null;
  body: string;
  authorName?: string | null;
}): { label: string; text: string } {
  const when = row.createdAt.slice(0, 16).replace("T", " ");
  const dir = row.direction === "inbound" ? "Received" : "Sent";
  const header = `${when} · ${dir} · ${row.channel}${row.authorName ? ` · ${row.authorName}` : ""}`;
  const subjectLine = row.subject ? `Subject: ${row.subject}\n` : "";
  return {
    label: `${dir} · ${row.channel}`,
    text: `${header}\n${subjectLine}${row.body.trim()}`,
  };
}

export function formatCallyzerAppendEntry(call: {
  calledAt: string;
  direction: string | null;
  durationSec: number | null;
  outcome: string | null;
  staffName: string | null;
}): { label: string; text: string } {
  const when = call.calledAt.slice(0, 16).replace("T", " ");
  return {
    label: "Callyzer call",
    text: `${when} · ${call.direction ?? "call"} · ${call.durationSec ?? 0}s · ${call.outcome ?? "—"} · ${call.staffName ?? "Unknown"}`,
  };
}
