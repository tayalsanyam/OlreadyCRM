import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";
import { toIsoTimestamp } from "@/lib/utils";
import {
  MAX_INTAKE_ATTACHMENTS,
  MAX_TICKET_ATTACHMENT_BYTES,
  TICKET_ATTACHMENT_MIME_TYPES,
} from "@/lib/ticket-attachments";
import type { PublicTicketLookupResult } from "@/lib/public-ticket-status";
import {
  PUBLIC_ESCALATION_ACTIVITY,
  PUBLIC_TIMELINE_ACTIVITY,
  publicTicketNextStep,
  publicTicketStatusLabel,
  formatPublicTicketCategory,
  type PublicTicketActivity,
} from "@/lib/public-ticket-status";
import { fromDbTicketStatus } from "@/lib/ticket-status";

export function validateIntakeFile(file: File): string | null {
  if (!file.size) return "Empty file";
  if (file.size > MAX_TICKET_ATTACHMENT_BYTES) return `${file.name} must be under 10 MB`;
  const mime = file.type || "application/octet-stream";
  if (!TICKET_ATTACHMENT_MIME_TYPES.has(mime)) {
    return `${file.name}: file type not allowed (PDF, images, Word, Excel, text)`;
  }
  return null;
}

export async function lookupOpenTicketsByPhone(
  tx: TransactionSql,
  phone: string
): Promise<
  Array<{
    id: string;
    ticketNumber: string;
    category: string;
    status: string;
    createdAt: string;
  }>
> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return [];

  return tx`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.category,
      t.status::text AS status,
      t.created_at AS "createdAt"
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    WHERE t.status <> 'closed'
      AND (
        RIGHT(REGEXP_REPLACE(COALESCE(t.raised_by_phone, ''), '\\D', '', 'g'), 10) = ${normalized}
        OR RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
        OR RIGHT(REGEXP_REPLACE(COALESCE(m.whatsapp, ''), '\\D', '', 'g'), 10) = ${normalized}
        OR RIGHT(REGEXP_REPLACE(COALESCE(m.alternate_phone, ''), '\\D', '', 'g'), 10) = ${normalized}
      )
    ORDER BY t.created_at DESC
    LIMIT 10
  `;
}

export async function verifyPublicTicketAccess(
  tx: TransactionSql,
  ticketId: string,
  phone: string
): Promise<boolean> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return false;

  const [row] = await tx<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM support.tickets t
      LEFT JOIN muas m ON m.id = t.mua_id
      WHERE t.id = ${ticketId}::uuid
        AND (
          RIGHT(REGEXP_REPLACE(COALESCE(t.raised_by_phone, ''), '\\D', '', 'g'), 10) = ${normalized}
          OR RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
          OR RIGHT(REGEXP_REPLACE(COALESCE(m.whatsapp, ''), '\\D', '', 'g'), 10) = ${normalized}
          OR RIGHT(REGEXP_REPLACE(COALESCE(m.alternate_phone, ''), '\\D', '', 'g'), 10) = ${normalized}
        )
    ) AS ok
  `;
  return Boolean(row?.ok);
}

export async function lookupPublicTicket(
  tx: TransactionSql,
  ticketNumber: string,
  phone: string
): Promise<PublicTicketLookupResult | null> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 10 || !ticketNumber.trim()) return null;

  const [row] = await tx<
    {
      id: string;
      ticketNumber: string;
      status: string;
      category: string;
      createdAt: string;
      updatedAt: string;
      closedAt: string | null;
      slaDueAt: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.status::text AS status,
      t.category,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      t.closed_at AS "closedAt",
      t.sla_due_at AS "slaDueAt"
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    WHERE UPPER(TRIM(t.ticket_number)) = UPPER(TRIM(${ticketNumber}))
      AND (
        RIGHT(REGEXP_REPLACE(COALESCE(t.raised_by_phone, ''), '\\D', '', 'g'), 10) = ${normalized}
        OR RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
        OR RIGHT(REGEXP_REPLACE(COALESCE(m.whatsapp, ''), '\\D', '', 'g'), 10) = ${normalized}
        OR RIGHT(REGEXP_REPLACE(COALESCE(m.alternate_phone, ''), '\\D', '', 'g'), 10) = ${normalized}
      )
    LIMIT 1
  `;

  if (!row) return null;

  const activity = await loadPublicTicketActivity(
    tx,
    row.id,
    toIsoTimestamp(row.createdAt)
  );

  return {
    ticketNumber: row.ticketNumber,
    status: row.status,
    statusLabel: publicTicketStatusLabel(row.status),
    category: formatPublicTicketCategory(row.category),
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
    closedAt: row.closedAt ? toIsoTimestamp(row.closedAt) : null,
    slaDueAt: row.slaDueAt ? toIsoTimestamp(row.slaDueAt) : null,
    activity,
    nextStep: publicTicketNextStep(row.status),
  };
}

async function loadPublicTicketActivity(
  tx: TransactionSql,
  ticketId: string,
  createdAt: string
): Promise<PublicTicketActivity[]> {
  const events: PublicTicketActivity[] = [
    { at: toIsoTimestamp(createdAt), label: "Concern received" },
  ];

  const history = await tx<{ toStatus: string; createdAt: unknown }[]>`
    SELECT to_status::text AS "toStatus", created_at AS "createdAt"
    FROM support.ticket_status_history
    WHERE ticket_id = ${ticketId}::uuid
    ORDER BY created_at ASC
  `;
  for (const h of history) {
    const key = fromDbTicketStatus(h.toStatus);
    if (key === "received") continue;
    const label = PUBLIC_TIMELINE_ACTIVITY[key] ?? PUBLIC_TIMELINE_ACTIVITY[h.toStatus];
    if (label) events.push({ at: toIsoTimestamp(h.createdAt), label });
  }

  const escalations = await tx<{ toLevel: number; createdAt: unknown }[]>`
    SELECT to_level AS "toLevel", created_at AS "createdAt"
    FROM support.ticket_escalations
    WHERE ticket_id = ${ticketId}::uuid
    ORDER BY created_at ASC
  `;
  for (const e of escalations) {
    const label = PUBLIC_ESCALATION_ACTIVITY[e.toLevel];
    if (label) {
      events.push({ at: toIsoTimestamp(e.createdAt), label });
    }
  }

  const emails = await tx<{ sentAt: unknown }[]>`
    SELECT sent_at AS "sentAt"
    FROM support.ticket_email_responses
    WHERE ticket_id = ${ticketId}::uuid
      AND status = 'sent'
      AND sent_at IS NOT NULL
    ORDER BY sent_at ASC
  `;
  for (const e of emails) {
    events.push({
      at: toIsoTimestamp(e.sentAt),
      label: "Email sent by care team",
    });
  }

  const updates = await tx<{ createdAt: unknown }[]>`
    SELECT created_at AS "createdAt"
    FROM support.ticket_updates
    WHERE ticket_id = ${ticketId}::uuid
      AND source = 'public_form'
    ORDER BY created_at ASC
  `;
  for (const u of updates) {
    events.push({
      at: toIsoTimestamp(u.createdAt),
      label: "Additional details received from you",
    });
  }

  return dedupePublicActivity(events)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-12);
}

function dedupePublicActivity(events: PublicTicketActivity[]): PublicTicketActivity[] {
  const seen = new Set<string>();
  const out: PublicTicketActivity[] = [];
  for (const e of events) {
    const at = toIsoTimestamp(e.at);
    const minute = at.slice(0, 16);
    const key = `${e.label}|${minute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at, label: e.label });
  }
  return out;
}

export async function savePublicIntakeAttachments(
  tx: TransactionSql,
  ticketId: string,
  files: File[]
): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = [];
  let saved = 0;

  if (files.length > MAX_INTAKE_ATTACHMENTS) {
    return {
      saved: 0,
      errors: [`Maximum ${MAX_INTAKE_ATTACHMENTS} files per submission`],
    };
  }

  const [countRow] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM support.ticket_attachments WHERE ticket_id = ${ticketId}::uuid
  `;
  const existing = countRow?.count ?? 0;

  const uploadDir = path.join(process.cwd(), "uploads", "tickets");
  await mkdir(uploadDir, { recursive: true });

  for (const file of files) {
    const validationError = validateIntakeFile(file);
    if (validationError) {
      errors.push(validationError);
      continue;
    }
    if (existing + saved >= MAX_INTAKE_ATTACHMENTS) {
      errors.push(`Maximum ${MAX_INTAKE_ATTACHMENTS} files per submission`);
      break;
    }

    const mime = file.type || "application/octet-stream";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const savedName = `${ticketId}-${Date.now()}-${saved}-${safeName}`;
    const diskPath = path.join(uploadDir, savedName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, bytes);
    const publicPath = `/uploads/tickets/${savedName}`;

    await tx`
      INSERT INTO support.ticket_attachments (
        ticket_id,
        uploaded_by,
        file_name,
        file_path,
        mime_type,
        attachment_category,
        visibility
      ) VALUES (
        ${ticketId}::uuid,
        NULL,
        ${file.name},
        ${publicPath},
        ${mime},
        'intake',
        'mua_visible'
      )
    `;

    saved += 1;
  }

  if (saved > 0) {
    await tx`
      INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
      VALUES (
        ${ticketId}::uuid,
        NULL,
        ${`${saved} file(s) attached from public support form`},
        true
      )
    `;
  }

  return { saved, errors };
}
