import type { TransactionSql } from "@/db/index";
import {
  CORRESPONDENCE_CHANNEL_LABEL,
  CORRESPONDENCE_KIND_LABEL,
  type CorrespondenceChannel,
  type CorrespondenceKind,
} from "@/lib/ticket-correspondence";

export type TicketCommunicationRow = {
  id: string;
  source: "correspondence" | "email" | "whatsapp";
  direction: "outbound" | "inbound";
  channel: string;
  subject: string | null;
  body: string;
  status: string | null;
  authorName: string | null;
  createdAt: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export async function fetchTicketCommunications(
  tx: TransactionSql,
  ticketId: string
): Promise<TicketCommunicationRow[]> {
  const [manual, emails] = await Promise.all([
    tx<
      {
        id: string;
        body: string;
        correspondenceKind: CorrespondenceKind;
        channel: CorrespondenceChannel;
        authorName: string | null;
        createdAt: string;
      }[]
    >`
      SELECT
        c.id,
        c.body,
        c.correspondence_kind AS "correspondenceKind",
        c.channel,
        s.name AS "authorName",
        c.created_at AS "createdAt"
      FROM support.ticket_comments c
      LEFT JOIN rm.staff s ON s.id = c.author_id
      WHERE c.ticket_id = ${ticketId}::uuid
        AND c.correspondence_kind IS NOT NULL
      ORDER BY c.created_at ASC
    `,
    tx<
      {
        id: string;
        subject: string;
        bodyHtml: string;
        toEmail: string;
        status: string;
        authorName: string | null;
        sentAt: string | null;
        createdAt: string;
        sendChannel: string | null;
      }[]
    >`
      SELECT
        e.id,
        e.subject,
        e.body_html AS "bodyHtml",
        e.to_email AS "toEmail",
        e.status::text AS status,
        s.name AS "authorName",
        e.sent_at AS "sentAt",
        e.created_at AS "createdAt",
        e.send_channel AS "sendChannel"
      FROM support.ticket_email_responses e
      LEFT JOIN rm.staff s ON s.id = e.created_by
      WHERE e.ticket_id = ${ticketId}::uuid
        AND e.status IN ('sent', 'approved', 'pending_approval', 'revision_requested')
      ORDER BY e.created_at ASC
    `,
  ]);

  const rows: TicketCommunicationRow[] = [];

  for (const c of manual) {
    rows.push({
      id: c.id,
      source: c.channel === "whatsapp" ? "whatsapp" : "correspondence",
      direction: c.correspondenceKind === "party_reply" ? "inbound" : "outbound",
      channel:
        CORRESPONDENCE_CHANNEL_LABEL[c.channel as keyof typeof CORRESPONDENCE_CHANNEL_LABEL] ??
        CORRESPONDENCE_KIND_LABEL[c.correspondenceKind as keyof typeof CORRESPONDENCE_KIND_LABEL],
      subject: null,
      body: c.body,
      status: null,
      authorName: c.authorName,
      createdAt: c.createdAt,
    });
  }

  for (const e of emails) {
    const channelSuffix =
      e.status === "sent" && e.sendChannel
        ? e.sendChannel === "resend"
          ? " · Resend"
          : " · Gmail"
        : "";
    const body = `[To: ${e.toEmail}]\n${stripHtml(e.bodyHtml)}`;
    rows.push({
      id: e.id,
      source: "email",
      direction: "outbound",
      channel: `Email${channelSuffix}`,
      subject: e.subject,
      body,
      status: e.status,
      authorName: e.authorName,
      createdAt: e.sentAt ?? e.createdAt,
    });
  }

  rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return rows;
}

export function communicationsToCsv(
  ticketNumber: string,
  rows: TicketCommunicationRow[]
): string {
  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const headers = [
    "Date",
    "Direction",
    "Channel",
    "Subject",
    "Body",
    "Status",
    "Logged by",
  ];
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        r.createdAt,
        r.direction,
        r.channel,
        r.subject ?? "",
        r.body,
        r.status ?? "",
        r.authorName ?? "",
      ]
        .map(escape)
        .join(",")
    ),
  ];
  return lines.join("\n");
}
