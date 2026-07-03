import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import {
  requireGrievanceAccess,
  requireGrievanceTicketCreateAccess,
} from "@/lib/api-auth";
import { createTicket, getTicketById } from "@/lib/ticket-create";
import { refreshSlaBreaches } from "@/lib/ticket-sla";
import { coerceUuid } from "@/lib/uuid";
import { muaNotOnPlanSql } from "@/lib/mua-active-plan";
import type { RaisedByType, TicketSource } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  await withTransaction(async (tx) => {
    await refreshSlaBreaches(tx);
  });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const urgency = searchParams.get("urgency");
  const q = searchParams.get("q")?.trim();
  const muaId = searchParams.get("muaId");
  const slaBreachedOnly = searchParams.get("slaBreached") === "true";
  const openOnly = searchParams.get("openOnly") === "true";
  const escalatedOnly = searchParams.get("escalated") === "true";
  const planSegment = searchParams.get("planSegment");
  const raisedByType = searchParams.get("raisedByType");

  const rows = await sql<
    {
      id: string;
      ticketNumber: string;
      raisedByType: string;
      raisedByName: string | null;
      muaName: string | null;
      brideName: string | null;
      leadDisplayId: string | null;
      leadId: string | null;
      category: string;
      status: string;
      urgency: string;
      source: string;
      slaDueAt: string | null;
      slaBreached: boolean;
      escalationLevel: number;
      createdAt: string;
      planTier: string | null;
      planExpiry: string | null;
      muaStatus: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.raised_by_type::text AS "raisedByType",
      t.raised_by_name AS "raisedByName",
      m.name AS "muaName",
      bl.bride_name AS "brideName",
      bl.display_id AS "leadDisplayId",
      t.lead_id AS "leadId",
      t.category,
      t.status::text AS status,
      t.urgency::text AS urgency,
      t.source::text AS source,
      t.sla_due_at AS "slaDueAt",
      (
        t.sla_breached
        OR (
          t.status != 'closed'
          AND t.sla_due_at IS NOT NULL
          AND t.sla_due_at < NOW()
        )
      ) AS "slaBreached",
      t.escalation_level AS "escalationLevel",
      t.created_at AS "createdAt",
      m.plan_tier::text AS "planTier",
      m.plan_expiry::text AS "planExpiry",
      m.status AS "muaStatus"
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE (${status ?? null}::text IS NULL OR t.status::text = ${status ?? null})
      AND (${category ?? null}::text IS NULL OR t.category = ${category ?? null})
      AND (${urgency ?? null}::text IS NULL OR t.urgency::text = ${urgency ?? null})
      AND (${raisedByType ?? null}::text IS NULL OR t.raised_by_type::text = ${raisedByType ?? null})
      AND (${muaId ?? null}::uuid IS NULL OR t.mua_id = ${muaId ?? null}::uuid)
      AND (${openOnly} = false OR t.status != 'closed')
      AND (${escalatedOnly} = false OR t.escalation_level > 1)
      AND (
        ${slaBreachedOnly} = false
        OR (
          t.sla_breached
          OR (
            t.status != 'closed'
            AND t.sla_due_at IS NOT NULL
            AND t.sla_due_at < NOW()
          )
        )
      )
      AND (
        ${planSegment ?? null}::text IS NULL
        OR (${planSegment} = 'unlinked' AND t.mua_id IS NULL)
        OR (${planSegment} = 'non_plan' AND t.mua_id IS NOT NULL AND ${sql.unsafe(muaNotOnPlanSql("m"))})
        OR (
          ${planSegment} = 'active_plan'
          AND m.plan_tier IS NOT NULL
          AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
        )
        OR (
          ${planSegment} IN ('expired_plan', 'lapsed')
          AND t.mua_id IS NOT NULL
          AND (
            (m.plan_expiry IS NOT NULL AND m.plan_expiry < CURRENT_DATE)
            OR (
              m.plan_tier IS NULL
              AND EXISTS (SELECT 1 FROM mua_plan_history h WHERE h.mua_id = m.id)
            )
          )
        )
      )
      AND (
        ${q ?? null}::text IS NULL
        OR t.ticket_number ILIKE ${q ? `%${q}%` : null}
        OR m.name ILIKE ${q ? `%${q}%` : null}
        OR bl.bride_name ILIKE ${q ? `%${q}%` : null}
        OR bl.display_id ILIKE ${q ? `%${q}%` : null}
        OR t.raised_by_name ILIKE ${q ? `%${q}%` : null}
        OR t.complaint_text ILIKE ${q ? `%${q}%` : null}
      )
    ORDER BY
      CASE WHEN t.escalation_level >= 3 AND t.status != 'closed' THEN 0 ELSE 1 END,
      CASE
        WHEN t.status != 'closed'
          AND t.sla_due_at IS NOT NULL
          AND t.sla_due_at < NOW()
        THEN 0
        ELSE 1
      END,
      CASE t.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      t.sla_due_at ASC NULLS LAST,
      t.created_at DESC
  `;

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireGrievanceTicketCreateAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    category?: string;
    categories?: string[];
    complaintText?: string;
    raisedByName?: string;
    raisedByPhone?: string;
    raisedByEmail?: string;
    raisedByType?: RaisedByType;
    source?: TicketSource;
    muaId?: string;
    leadId?: string;
    sendAck?: boolean;
  };

  if (!body.complaintText?.trim()) {
    return NextResponse.json(
      { data: null, error: "complaintText is required" },
      { status: 400 }
    );
  }

  const source: TicketSource =
    auth.session.role === "feedbackRm" ? "feedbackIntake" : body.source ?? "manual";

  try {
    const createdBy = coerceUuid(auth.session.userId);
    const ticket = await withTransaction(async (tx) =>
      createTicket(tx, {
        category: body.category,
        categories: body.categories,
        complaintText: body.complaintText!.trim(),
        raisedByName: body.raisedByName ?? null,
        raisedByPhone: body.raisedByPhone ?? null,
        raisedByEmail: body.raisedByEmail ?? null,
        raisedByType: body.raisedByType ?? "mua",
        source,
        muaId: coerceUuid(body.muaId),
        leadId: coerceUuid(body.leadId),
        createdBy,
        sendAck: body.sendAck ?? source !== "feedbackIntake",
      })
    );

    return NextResponse.json({ data: ticket, error: null }, { status: 201 });
  } catch (err) {
    console.error("[crm/tickets POST]", err);
    const detail = err instanceof Error ? err.message : "Failed to create ticket";
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        data: null,
        error: isDev ? detail : "Failed to create ticket",
      },
      { status: 500 }
    );
  }
}
