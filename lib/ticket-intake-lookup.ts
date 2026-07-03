import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export type PendingTicketRow = {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  urgency: string;
  createdAt: string;
};

export type IntakeLeadMatch = {
  leadId: string;
  displayId: string;
  brideName: string;
  phone: string | null;
  region: string | null;
  pendingTickets: PendingTicketRow[];
};

export type IntakeMuaMatch = {
  muaId: string;
  displayId: string;
  name: string;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  planTier: string | null;
  pendingTickets: PendingTicketRow[];
};

type LookupInput = {
  name?: string;
  phone?: string;
  email?: string;
  muaId?: string;
};

export async function lookupMuaForIntake(
  tx: TransactionSql,
  input: LookupInput,
  limit = 25
): Promise<IntakeMuaMatch[]> {
  const muaId = input.muaId?.trim();
  if (muaId) {
    const row = await fetchMuaIntakeRow(tx, muaId);
    return row ? [row] : [];
  }

  const name = input.name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const phone = normalizePhone(input.phone ?? "");

  if (!name && !email && phone.length < 10) return [];

  const likeName = name.length >= 3 ? `%${name.replace(/%/g, "")}%` : null;

  const muaIds = await tx<{ id: string }[]>`
    SELECT m.id
    FROM muas m
    WHERE m.status <> 'junk'
      AND (
        (${likeName}::text IS NOT NULL AND m.name ILIKE ${likeName})
        OR (${email.includes("@")} AND LOWER(COALESCE(m.email, '')) = ${email})
        OR (${phone.length >= 10} AND RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${phone})
        OR (${phone.length >= 10} AND RIGHT(REGEXP_REPLACE(COALESCE(m.alternate_phone, ''), '\\D', '', 'g'), 10) = ${phone})
        OR (${phone.length >= 10} AND RIGHT(REGEXP_REPLACE(COALESCE(m.whatsapp, ''), '\\D', '', 'g'), 10) = ${phone})
      )
    ORDER BY m.name
    LIMIT ${limit}
  `;

  const rows: IntakeMuaMatch[] = [];
  for (const { id } of muaIds) {
    const row = await fetchMuaIntakeRow(tx, id);
    if (row) rows.push(row);
  }
  return rows;
}

async function fetchMuaIntakeRow(
  tx: TransactionSql,
  muaId: string
): Promise<IntakeMuaMatch | null> {
  const [mua] = await tx<{
    muaId: string;
    displayId: string;
    name: string;
    phone: string | null;
    alternatePhone: string | null;
    email: string | null;
    whatsapp: string | null;
    city: string | null;
    planTier: string | null;
  }[]>`
    SELECT
      m.id AS "muaId",
      m.display_id AS "displayId",
      m.name,
      m.phone,
      m.alternate_phone AS "alternatePhone",
      m.email,
      m.whatsapp,
      m.city,
      m.plan_tier::text AS "planTier"
    FROM muas m
    WHERE m.id = ${muaId}::uuid AND m.status <> 'junk'
    LIMIT 1
  `;

  if (!mua) return null;

  const pendingTickets = await tx<PendingTicketRow[]>`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.category,
      t.status::text AS status,
      t.urgency::text AS urgency,
      t.created_at AS "createdAt"
    FROM support.tickets t
    WHERE t.status <> 'closed'
      AND (
        t.mua_id = ${muaId}::uuid
        OR (
          t.mua_id IS NULL
          AND (
            (${mua.phone ?? null}::text IS NOT NULL AND t.raised_by_phone IS NOT NULL
              AND RIGHT(REGEXP_REPLACE(t.raised_by_phone, '\\D', '', 'g'), 10)
                = RIGHT(REGEXP_REPLACE(${mua.phone}, '\\D', '', 'g'), 10))
            OR (${mua.email ?? null}::text IS NOT NULL AND LOWER(t.raised_by_email) = LOWER(${mua.email}))
          )
        )
      )
    ORDER BY t.created_at DESC
    LIMIT 10
  `;

  return { ...mua, pendingTickets };
}

export async function resolvePrimaryCategory(
  tx: TransactionSql,
  categories: string[]
): Promise<string> {
  const unique = [...new Set(categories.filter(Boolean))];
  if (!unique.length) return "other";
  if (unique.length === 1) return unique[0]!;

  const [row] = await tx<{ category: string }[]>`
    SELECT category
    FROM support.category_config
    WHERE category = ANY(${unique}::text[]) AND active = true
    ORDER BY
      CASE default_urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      sla_hours ASC
    LIMIT 1
  `;

  return row?.category ?? unique[0]!;
}

type LeadLookupInput = {
  name?: string;
  phone?: string;
  email?: string;
  leadId?: string;
};

export async function lookupLeadForIntake(
  tx: TransactionSql,
  input: LeadLookupInput,
  limit = 25
): Promise<IntakeLeadMatch[]> {
  const leadId = input.leadId?.trim();
  if (leadId) {
    const row = await fetchLeadIntakeRow(tx, leadId);
    return row ? [row] : [];
  }

  const name = input.name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const phone = normalizePhone(input.phone ?? "");

  if (!name && !email && phone.length < 10) return [];

  const likeName = name.length >= 2 ? `%${name.replace(/%/g, "")}%` : null;
  const likeEmail = email.includes("@") ? `%${email.replace(/%/g, "")}%` : null;

  const leadIds = await tx<{ id: string }[]>`
    SELECT bl.id
    FROM bride_leads bl
    WHERE bl.status NOT IN ('archived', 'pending_verification')
      AND (
        (${likeName}::text IS NOT NULL AND bl.bride_name ILIKE ${likeName})
        OR (${likeEmail}::text IS NOT NULL AND LOWER(COALESCE(bl.email, '')) ILIKE ${likeEmail})
        OR (${phone.length >= 10} AND RIGHT(REGEXP_REPLACE(COALESCE(bl.phone, ''), '\\D', '', 'g'), 10) = ${phone})
      )
    ORDER BY bl.updated_at DESC
    LIMIT ${limit}
  `;

  const rows: IntakeLeadMatch[] = [];
  for (const { id } of leadIds) {
    const row = await fetchLeadIntakeRow(tx, id);
    if (row) rows.push(row);
  }
  return rows;
}

async function fetchLeadIntakeRow(
  tx: TransactionSql,
  leadId: string
): Promise<IntakeLeadMatch | null> {
  const [lead] = await tx<{
    leadId: string;
    displayId: string;
    brideName: string;
    phone: string | null;
    region: string | null;
  }[]>`
    SELECT
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.phone,
      bl.region::text AS region
    FROM bride_leads bl
    WHERE bl.id = ${leadId}::uuid
    LIMIT 1
  `;

  if (!lead) return null;

  const pendingTickets = await tx<PendingTicketRow[]>`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.category,
      t.status::text AS status,
      t.urgency::text AS urgency,
      t.created_at AS "createdAt"
    FROM support.tickets t
    WHERE t.status <> 'closed'
      AND (
        t.lead_id = ${leadId}::uuid
        OR (
          t.lead_id IS NULL
          AND t.raised_by_type = 'bride'
          AND t.raised_by_phone IS NOT NULL
          AND RIGHT(REGEXP_REPLACE(t.raised_by_phone, '\\D', '', 'g'), 10)
            = RIGHT(REGEXP_REPLACE(COALESCE(${lead.phone}, ''), '\\D', '', 'g'), 10)
        )
      )
    ORDER BY t.created_at DESC
    LIMIT 10
  `;

  return { ...lead, pendingTickets };
}

export async function lookupPendingByContact(
  tx: TransactionSql,
  input: { phone?: string; email?: string }
): Promise<PendingTicketRow[]> {
  const phone = normalizePhone(input.phone ?? "");
  const email = input.email?.trim().toLowerCase() ?? "";
  if (phone.length < 10 && !email.includes("@")) return [];

  return tx<PendingTicketRow[]>`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.category,
      t.status::text AS status,
      t.urgency::text AS urgency,
      t.created_at AS "createdAt"
    FROM support.tickets t
    WHERE t.status <> 'closed'
      AND (
        (${phone.length >= 10} AND t.raised_by_phone IS NOT NULL
          AND RIGHT(REGEXP_REPLACE(t.raised_by_phone, '\\D', '', 'g'), 10) = ${phone})
        OR (${email.includes("@")} AND LOWER(COALESCE(t.raised_by_email, '')) = ${email})
      )
    ORDER BY t.created_at DESC
    LIMIT 10
  `;
}
