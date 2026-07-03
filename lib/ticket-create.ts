import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import type {
  RaisedByType,
  SupportTicket,
  TicketSource,
  TicketUrgency,
} from "@/lib/types";
import {
  fromDbRaisedByType,
  fromDbTicketSource,
  fromDbTicketStatus,
  fromDbTicketUrgency,
  toDbRaisedByType,
  toDbTicketSource,
  toDbTicketUrgency,
} from "@/lib/ticket-db-mappers";
import { buildTicketContext } from "@/lib/ticket-context";
import { matchLeadByPhone } from "@/lib/ticket-lead-match";
import { matchMuaByPhone, matchMuaById } from "@/lib/ticket-mua-match";
import { runTicketAi } from "@/lib/ticket-ai";
import { categoryTagKey } from "@/lib/ticket-categories";
import { COMM } from "@/lib/comm-types";
import { resolvePrimaryCategory } from "@/lib/ticket-intake-lookup";
import { logCareComm, notifyAdminsOfTicket } from "@/lib/ticket-ledger";
import { coerceUuid } from "@/lib/uuid";
import { appendCareEmailSignature } from "@/lib/care-email-signature";
import { getCareGmailAddress, renderTemplate, sendCareEmail } from "@/lib/resend";
import { ensureTicketThreadSubject } from "@/lib/ticket-email-thread";
import { createIntakeCareTask } from "@/lib/ticket-care-workflow";

export type CreateTicketInput = {
  category?: string;
  categories?: string[];
  complaintText: string;
  raisedByName?: string | null;
  raisedByPhone?: string | null;
  raisedByEmail?: string | null;
  raisedByType?: RaisedByType;
  source: TicketSource;
  muaId?: string | null;
  leadId?: string | null;
  createdBy?: string | null;
  sendAck?: boolean;
};

function mapTicketRow(row: Record<string, unknown>): SupportTicket {
  return {
    id: String(row.id),
    ticketNumber: String(row.ticketNumber),
    muaId: row.muaId ? String(row.muaId) : null,
    muaName: row.muaName ? String(row.muaName) : null,
    leadId: row.leadId ? String(row.leadId) : null,
    brideName: row.brideName ? String(row.brideName) : null,
    leadDisplayId: row.leadDisplayId ? String(row.leadDisplayId) : null,
    category: String(row.category),
    subcategory: row.subcategory ? String(row.subcategory) : null,
    status: fromDbTicketStatus(String(row.status)),
    urgency: fromDbTicketUrgency(String(row.urgency)),
    source: fromDbTicketSource(String(row.source)),
    raisedByType: fromDbRaisedByType(String(row.raisedByType)),
    raisedByName: row.raisedByName ? String(row.raisedByName) : null,
    raisedByPhone: row.raisedByPhone ? String(row.raisedByPhone) : null,
    raisedByEmail: row.raisedByEmail ? String(row.raisedByEmail) : null,
    complaintText: String(row.complaintText),
    assignedTo: row.assignedTo ? String(row.assignedTo) : null,
    assignedAdminId: row.assignedAdminId ? String(row.assignedAdminId) : null,
    assignedAdminName: row.assignedAdminName ? String(row.assignedAdminName) : null,
    createdBy: row.createdBy ? String(row.createdBy) : null,
    escalationLevel: Number(row.escalationLevel ?? 1),
    escalatedAt: row.escalatedAt ? String(row.escalatedAt) : null,
    escalationReason: row.escalationReason ? String(row.escalationReason) : null,
    slaDueAt: row.slaDueAt ? String(row.slaDueAt) : null,
    slaBreached: Boolean(row.slaBreached),
    flags: Array.isArray(row.flags) ? (row.flags as string[]) : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    closedAt: row.closedAt ? String(row.closedAt) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

async function computeSlaDueAt(
  tx: TransactionSql,
  urgency: TicketUrgency
): Promise<string> {
  const [sla] = await tx<{ highHours: number; mediumHours: number; lowHours: number }[]>`
    SELECT high_hours AS "highHours", medium_hours AS "mediumHours", low_hours AS "lowHours"
    FROM support.sla_config WHERE id = 1
  `;
  const hours =
    urgency === "high"
      ? sla?.highHours ?? 24
      : urgency === "low"
        ? sla?.lowHours ?? 72
        : sla?.mediumHours ?? 48;

  const due = new Date();
  due.setHours(due.getHours() + hours);
  return due.toISOString();
}

async function assignDefaultCareAgent(tx: TransactionSql): Promise<string | null> {
  const [agent] = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role = 'care_agent' AND active = true
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return agent?.id ?? null;
}

async function sendAckEmail(params: {
  to: string;
  muaName: string;
  ticketNumber: string;
}) {
  const subject = ensureTicketThreadSubject(
    params.ticketNumber,
    renderTemplate("We received your concern — {{ticket_number}}", {
      ticket_number: params.ticketNumber,
    }),
  );
  const body = renderTemplate(
    `Dear {{mua_name}},

Thank you for reaching out to Team Olready. We have received your concern (reference {{ticket_number}}) and our care team is reviewing it.

Please save this reference number. You can check status anytime at our support page using your phone number and ticket reference {{ticket_number}}.

We will get back to you by email from ${getCareGmailAddress()}.

${appendCareEmailSignature("", "plain")}`,
    {
      mua_name: params.muaName,
      ticket_number: params.ticketNumber,
    }
  );

  return sendCareEmail({
    to: params.to,
    subject,
    html: body,
    text: body,
    replyTo: getCareGmailAddress(),
  });
}

export async function createTicket(
  tx: TransactionSql,
  input: CreateTicketInput
): Promise<SupportTicket & { ackSent?: boolean }> {
  let muaId = coerceUuid(input.muaId);
  let leadId = coerceUuid(input.leadId);
  const createdBy = coerceUuid(input.createdBy);
  const raisedBy = input.raisedByType ?? "mua";

  // Only auto-link MUA when the complainant is an MUA (or muaId was passed explicitly).
  if (raisedBy === "mua") {
    if (!muaId && input.raisedByPhone) {
      const muaMatches = await matchMuaByPhone(tx, input.raisedByPhone);
      if (muaMatches[0]) muaId = muaMatches[0].muaId;
    }

    if (!muaId && input.raisedByEmail) {
      const emailMatches = await tx<{ muaId: string }[]>`
        SELECT m.id AS "muaId"
        FROM muas m
        WHERE m.status <> 'junk'
          AND LOWER(COALESCE(m.email, '')) = LOWER(${input.raisedByEmail.trim()})
        LIMIT 1
      `;
      if (emailMatches[0]) muaId = emailMatches[0].muaId;
    }
  }

  // Only auto-link bride lead when the complainant is a bride (or leadId was passed explicitly).
  if (raisedBy === "bride" && !leadId && input.raisedByPhone) {
    const leadMatches = await matchLeadByPhone(tx, input.raisedByPhone, muaId);
    if (leadMatches[0]) leadId = leadMatches[0].leadId;
  }

  const selectedCategories =
    input.categories?.filter(Boolean).length
      ? [...new Set(input.categories!.filter(Boolean))]
      : input.category
        ? [input.category]
        : ["other"];

  const category = await resolvePrimaryCategory(tx, selectedCategories);
  const categoryTags = selectedCategories.map((c) => categoryTagKey(c));
  const [catConfig] = await tx<{ defaultUrgency: string }[]>`
    SELECT default_urgency::text AS "defaultUrgency"
    FROM support.category_config
    WHERE category = ${category} AND active = true
    LIMIT 1
  `;

  let urgency = toDbTicketUrgency(
    (catConfig?.defaultUrgency as TicketUrgency) ?? "medium"
  );

  const context = await buildTicketContext(tx, muaId, undefined, leadId);
  const ai = await runTicketAi(tx, {
    mode: "triage",
    complaintText: input.complaintText,
    category,
    context,
  });

  const triage = ai.triage ?? {};
  const triageCategory =
    raisedBy === "bride" || raisedBy === "other"
      ? category
      : typeof triage.category === "string"
        ? triage.category
        : category;
  const triageUrgency =
    typeof triage.urgency === "string" ? triage.urgency : catConfig?.defaultUrgency ?? "medium";
  const triageTags = Array.isArray(triage.tags) ? (triage.tags as string[]) : [];
  const allTags = [...new Set([...categoryTags, ...triageTags])];

  urgency = toDbTicketUrgency(triageUrgency as TicketUrgency);
  const slaDueAt = await computeSlaDueAt(tx, triageUrgency as TicketUrgency);
  const assignedTo = await assignDefaultCareAgent(tx);

  const [row] = await tx<Record<string, unknown>[]>`
    INSERT INTO support.tickets (
      ticket_number,
      mua_id,
      lead_id,
      category,
      status,
      urgency,
      source,
      raised_by_type,
      raised_by_name,
      raised_by_phone,
      raised_by_email,
      complaint_text,
      assigned_to,
      created_by,
      sla_due_at,
      tags,
      ai_triage
    ) VALUES (
      '',
      ${muaId},
      ${leadId},
      ${triageCategory},
      'received',
      ${urgency}::support.ticket_urgency,
      ${toDbTicketSource(input.source)}::support.ticket_source,
      ${toDbRaisedByType(input.raisedByType ?? "mua")}::support.raised_by_type,
      ${input.raisedByName ?? null},
      ${input.raisedByPhone ?? null},
      ${input.raisedByEmail ?? null},
      ${input.complaintText},
      ${assignedTo},
      ${createdBy},
      ${slaDueAt}::timestamptz,
      ${allTags},
      ${tx.json(triage as Record<string, unknown>)}
    )
    RETURNING
      id,
      ticket_number AS "ticketNumber",
      mua_id AS "muaId",
      lead_id AS "leadId",
      category,
      subcategory,
      status::text AS status,
      urgency::text AS urgency,
      source::text AS source,
      raised_by_type::text AS "raisedByType",
      raised_by_name AS "raisedByName",
      raised_by_phone AS "raisedByPhone",
      raised_by_email AS "raisedByEmail",
      complaint_text AS "complaintText",
      assigned_to AS "assignedTo",
      assigned_admin_id AS "assignedAdminId",
      created_by AS "createdBy",
      escalation_level AS "escalationLevel",
      escalated_at AS "escalatedAt",
      escalation_reason AS "escalationReason",
      sla_due_at AS "slaDueAt",
      sla_breached AS "slaBreached",
      flags,
      tags,
      closed_at AS "closedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  const ticket = mapTicketRow(row);

  if (muaId) {
    const mua = await matchMuaById(tx, muaId);
    ticket.muaName = mua?.muaName ?? input.raisedByName ?? null;
  }

  await tx`
    INSERT INTO support.ticket_status_history (ticket_id, from_status, to_status, changed_by, reason)
    VALUES (${ticket.id}::uuid, NULL, 'received', ${createdBy}, 'Ticket created')
  `;

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal, is_ai_generated, ai_mode)
    VALUES (
      ${ticket.id}::uuid,
      ${createdBy},
      ${ai.response},
      true,
      true,
      'triage'
    )
  `;

  await tx`
    INSERT INTO support.ticket_ai_logs (ticket_id, mode, prompt_summary, response, created_by)
    VALUES (
      ${ticket.id}::uuid,
      'triage',
      ${input.complaintText.slice(0, 500)},
      ${ai.response},
      ${createdBy}
    )
  `;

  if (selectedCategories.includes("lead_reversal")) {
    await tx`
      INSERT INTO support.lead_reversal_reviews (ticket_id)
      VALUES (${ticket.id}::uuid)
      ON CONFLICT (ticket_id) DO NOTHING
    `;
  }

  if (muaId) {
    await logCareComm(tx, {
      muaId,
      leadId,
      entryType: "careTicketCreated",
      description: `Care ticket ${ticket.ticketNumber} opened — ${triageCategory.replace(/_/g, " ")}`,
      actorId: createdBy,
      metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
    });
  } else if (leadId) {
    await appendComm(tx, {
      leadId,
      entryType: COMM.careTicketCreated,
      description: `Care ticket ${ticket.ticketNumber} opened — ${triageCategory.replace(/_/g, " ")}`,
      actorId: createdBy,
      metadata: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        source: "grievance_centre",
      },
    });
  }

  await notifyAdminsOfTicket(tx, {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    message: `New care ticket ${ticket.ticketNumber} — ${triageCategory.replace(/_/g, " ")}`,
  });

  const shouldAck = input.sendAck !== false;
  const ackEmail = input.raisedByEmail?.trim();
  const ackName = ticket.muaName ?? input.raisedByName ?? "there";

  let ackSent = false;
  if (shouldAck && ackEmail) {
    const ackResult = await sendAckEmail({
      to: ackEmail,
      muaName: ackName,
      ticketNumber: ticket.ticketNumber,
    });
    ackSent = ackResult.ok;

    if (muaId && ackSent) {
      await logCareComm(tx, {
        muaId,
        leadId,
        entryType: "careEmailSent",
        description: `Acknowledgement sent for ${ticket.ticketNumber}`,
        actorId: createdBy,
        metadata: { ticketId: ticket.id, subject: `Ack — ${ticket.ticketNumber}` },
      });
    }
  }

  await createIntakeCareTask(tx, ticket, createdBy);

  return { ...ticket, ackSent: ackSent || undefined };
}

export async function getTicketById(
  tx: TransactionSql,
  ticketId: string
): Promise<SupportTicket | null> {
  const [row] = await tx<Record<string, unknown>[]>`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName",
      bl.display_id AS "leadDisplayId",
      t.category,
      t.subcategory,
      t.status::text AS status,
      t.urgency::text AS urgency,
      t.source::text AS source,
      t.raised_by_type::text AS "raisedByType",
      t.raised_by_name AS "raisedByName",
      t.raised_by_phone AS "raisedByPhone",
      t.raised_by_email AS "raisedByEmail",
      t.complaint_text AS "complaintText",
      t.assigned_to AS "assignedTo",
      t.assigned_admin_id AS "assignedAdminId",
      admin_s.name AS "assignedAdminName",
      t.created_by AS "createdBy",
      t.escalation_level AS "escalationLevel",
      t.escalated_at AS "escalatedAt",
      t.escalation_reason AS "escalationReason",
      t.sla_due_at AS "slaDueAt",
      t.sla_breached AS "slaBreached",
      t.flags,
      t.tags,
      t.closed_at AS "closedAt",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN staff admin_s ON admin_s.id = t.assigned_admin_id
    WHERE t.id = ${ticketId}::uuid
  `;

  return row ? mapTicketRow(row) : null;
}

export async function generateCareTaskDisplayId(tx: TransactionSql): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^CT-([0-9]+)$'))[1]::int),
      0
    ) + 1 AS n
    FROM support.ticket_tasks
    WHERE display_id ~ '^CT-[0-9]+$'
  `;
  return `CT-${String(row?.n ?? 1).padStart(4, "0")}`;
}
