import type { TransactionSql } from "@/db/index";
import { COMM } from "@/lib/comm-types";

export type InvestigationLedgerEntry = {
  id: string;
  source: "sales" | "rm" | "commission" | "care";
  entryType: string;
  description: string;
  createdAt: string;
  actorName: string | null;
  leadDisplayId: string | null;
  leadName: string | null;
  metadata: Record<string, unknown>;
};

export type InvestigationPush = {
  id: string;
  leadDisplayId: string;
  brideName: string;
  stage: string;
  status: string;
  rmName: string | null;
  leadStatus: string;
  shiftedAt: string | null;
  createdAt: string;
  phase: "rm" | "commission";
};

export type InvestigationBooking = {
  id: string;
  leadDisplayId: string;
  brideName: string;
  bookedPrice: number;
  advancePaid: number | null;
  createdAt: string;
};

export type TicketInvestigation = {
  mua: {
    id: string;
    name: string;
    phone: string | null;
    city: string | null;
    planTier: string | null;
    assignedRmName: string | null;
    totalPushes: number;
    activePushes: number;
    totalBookings: number;
  } | null;
  bride: {
    leadId: string;
    displayId: string;
    brideName: string;
    phone: string | null;
    status: string;
    assignedRmName: string | null;
    comms: InvestigationLedgerEntry[];
    pushes: Array<{
      id: string;
      muaName: string;
      stage: string;
      status: string;
      createdAt: string;
    }>;
  } | null;
  sales: {
    pipeline: {
      id: string;
      stage: string;
      muaType: string | null;
      assignedToName: string | null;
      salesClosedByName: string | null;
      daysInStage: number | null;
    } | null;
    onboarding: {
      businessName: string | null;
      plan: string | null;
      checklist1Complete: boolean;
      checklist2Complete: boolean;
      updatedAt: string | null;
    } | null;
    training: {
      complete: boolean;
      profileLink: string | null;
      updatedAt: string | null;
    } | null;
    activation: {
      profileLinkVerified: boolean;
      invoiceGenerated: boolean;
      contractGenerated: boolean;
      activatedAt: string | null;
    } | null;
    comms: InvestigationLedgerEntry[];
  };
  rm: {
    assignedRmName: string | null;
    pushes: InvestigationPush[];
    comms: InvestigationLedgerEntry[];
    bookings: InvestigationBooking[];
    stats: { pushes: number; bookings: number };
  };
  commission: {
    pushes: InvestigationPush[];
    comms: InvestigationLedgerEntry[];
    bookings: InvestigationBooking[];
    stats: { pushes: number; bookings: number };
  };
  ledger: InvestigationLedgerEntry[];
};

type RmCommRow = {
  id: string;
  entryType: string;
  description: string;
  createdAt: string;
  actorName: string | null;
  leadDisplayId: string | null;
  leadName: string | null;
  metadata: Record<string, unknown>;
  shiftedAt: string | null;
  leadStatus: string | null;
};

type SalesCommRow = {
  id: string;
  entryType: string;
  description: string;
  createdAt: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
};

type PushRow = {
  id: string;
  stage: string;
  status: string;
  createdAt: string;
  leadDisplayId: string;
  brideName: string;
  leadStatus: string;
  shiftedAt: string | null;
  rmName: string | null;
};

type BookingRow = {
  id: string;
  leadDisplayId: string;
  brideName: string;
  bookedPrice: number;
  advancePaid: number | null;
  createdAt: string;
};

const CARE_ENTRY_TYPE_VALUES = new Set<string>(Object.values(COMM).filter((v) => v.startsWith("care_")));

function isCareComm(entryType: string, metadata: Record<string, unknown>): boolean {
  if (CARE_ENTRY_TYPE_VALUES.has(entryType)) return true;
  if (metadata.source === "grievance_centre") return true;
  return false;
}

function commPhase(
  createdAt: string,
  shiftedAt: string | null,
  leadStatus: string | null
): "rm" | "commission" {
  if (shiftedAt) {
    return new Date(createdAt) >= new Date(shiftedAt) ? "commission" : "rm";
  }
  if (leadStatus === "commission_rm") return "commission";
  return "rm";
}

function pushPhase(
  createdAt: string,
  shiftedAt: string | null,
  leadStatus: string
): "rm" | "commission" {
  return commPhase(createdAt, shiftedAt, leadStatus);
}

function toLedgerEntry(
  row: {
    id: string;
    entryType: string;
    description: string;
    createdAt: string;
    actorName: string | null;
    leadDisplayId: string | null;
    leadName: string | null;
    metadata: Record<string, unknown>;
    shiftedAt?: string | null;
    leadStatus?: string | null;
  },
  forceSource?: InvestigationLedgerEntry["source"]
): InvestigationLedgerEntry {
  const meta = row.metadata ?? {};
  let source: InvestigationLedgerEntry["source"];
  if (forceSource) {
    source = forceSource;
  } else if (isCareComm(row.entryType, meta)) {
    source = "care";
  } else {
    source = commPhase(row.createdAt, row.shiftedAt ?? null, row.leadStatus ?? null);
  }
  return {
    id: row.id,
    source,
    entryType: row.entryType,
    description: row.description,
    createdAt: row.createdAt,
    actorName: row.actorName,
    leadDisplayId: row.leadDisplayId,
    leadName: row.leadName,
    metadata: meta,
  };
}

async function loadBrideInvestigation(
  tx: TransactionSql,
  leadId: string,
): Promise<TicketInvestigation["bride"]> {
  const [lead] = await tx<
    {
      id: string;
      displayId: string;
      brideName: string;
      phone: string | null;
      status: string;
      assignedRmName: string | null;
    }[]
  >`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.phone,
      bl.status::text AS status,
      s.name AS "assignedRmName"
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    WHERE bl.id = ${leadId}::uuid
  `;
  if (!lead) return null;

  const commRows = await tx<
    {
      id: string;
      entryType: string;
      description: string;
      createdAt: string;
      actorName: string | null;
    }[]
  >`
    SELECT
      c.id,
      c.entry_type AS "entryType",
      c.description,
      c.created_at AS "createdAt",
      s.name AS "actorName"
    FROM comms c
    LEFT JOIN staff s ON s.id = c.actor_id
    WHERE c.lead_id = ${leadId}::uuid
    ORDER BY c.created_at DESC
    LIMIT 80
  `;

  const pushRows = await tx<
    {
      id: string;
      muaName: string;
      stage: string;
      status: string;
      createdAt: string;
    }[]
  >`
    SELECT
      mp.id,
      m.name AS "muaName",
      mp.stage::text AS stage,
      mp.status::text AS status,
      mp.created_at AS "createdAt"
    FROM mua_pushes mp
    JOIN muas m ON m.id = mp.mua_id
    WHERE mp.lead_id = ${leadId}::uuid
    ORDER BY mp.created_at DESC
    LIMIT 40
  `;

  return {
    leadId: lead.id,
    displayId: lead.displayId,
    brideName: lead.brideName,
    phone: lead.phone,
    status: lead.status,
    assignedRmName: lead.assignedRmName,
    comms: commRows.map((c: RmCommRow) => ({
      id: c.id,
      source: "rm" as const,
      entryType: c.entryType,
      description: c.description,
      createdAt: c.createdAt,
      actorName: c.actorName,
      leadDisplayId: lead.displayId,
      leadName: lead.brideName,
      metadata: {},
    })),
    pushes: pushRows,
  };
}

export async function buildTicketInvestigation(
  tx: TransactionSql,
  muaId: string | null,
  ticketId?: string | null,
  leadId?: string | null,
): Promise<TicketInvestigation> {
  const bride = leadId ? await loadBrideInvestigation(tx, leadId) : null;

  const empty: TicketInvestigation = {
    mua: null,
    bride,
    sales: {
      pipeline: null,
      onboarding: null,
      training: null,
      activation: null,
      comms: [],
    },
    rm: {
      assignedRmName: null,
      pushes: [],
      comms: [],
      bookings: [],
      stats: { pushes: 0, bookings: 0 },
    },
    commission: { pushes: [], comms: [], bookings: [], stats: { pushes: 0, bookings: 0 } },
    ledger: [],
  };

  if (!muaId) return empty;

  const [mua] = await tx<
    {
      id: string;
      name: string;
      phone: string | null;
      city: string | null;
      planTier: string | null;
      assignedRmName: string | null;
      totalPushes: number;
      activePushes: number;
      totalBookings: number;
    }[]
  >`
    SELECT
      m.id,
      m.name,
      m.phone,
      m.city,
      m.plan_tier AS "planTier",
      s.name AS "assignedRmName",
      (SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.mua_id = m.id) AS "totalPushes",
      (SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.mua_id = m.id AND mp.status = 'active') AS "activePushes",
      (SELECT COUNT(*)::int FROM bookings b WHERE b.mua_id = m.id AND NOT b.cancelled) AS "totalBookings"
    FROM muas m
    LEFT JOIN staff s ON s.id = m.assigned_rm_id
    WHERE m.id = ${muaId}::uuid
  `;

  if (!mua) return { ...empty, bride };

  const [pipeline] = await tx<
    {
      id: string;
      stage: string;
      muaType: string | null;
      assignedToName: string | null;
      salesClosedByName: string | null;
      daysInStage: number | null;
    }[]
  >`
    SELECT
      p.id,
      p.stage,
      p.mua_type AS "muaType",
      a.name AS "assignedToName",
      sc.name AS "salesClosedByName",
      DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage"
    FROM sales.pipeline p
    LEFT JOIN staff a ON a.id = p.assigned_to
    LEFT JOIN staff sc ON sc.id = p.sales_closed_by
    WHERE p.mua_id = ${muaId}::uuid AND p.status = 'active'
    ORDER BY p.updated_at DESC
    LIMIT 1
  `;

  let onboarding: TicketInvestigation["sales"]["onboarding"] = null;
  let training: TicketInvestigation["sales"]["training"] = null;
  let activation: TicketInvestigation["sales"]["activation"] = null;

  if (pipeline?.id) {
    const [ob] = await tx<
      {
        businessName: string | null;
        plan: string | null;
        checklist1Complete: boolean;
        checklist2Complete: boolean;
        updatedAt: string | null;
      }[]
    >`
      SELECT
        business_name AS "businessName",
        plan,
        checklist1_complete AS "checklist1Complete",
        checklist2_complete AS "checklist2Complete",
        updated_at AS "updatedAt"
      FROM sales.onboarding
      WHERE pipeline_id = ${pipeline.id}::uuid
      LIMIT 1
    `;
    onboarding = ob ?? null;

    const [tr] = await tx<
      { complete: boolean; profileLink: string | null; updatedAt: string | null }[]
    >`
      SELECT complete, profile_link AS "profileLink", updated_at AS "updatedAt"
      FROM sales.training
      WHERE pipeline_id = ${pipeline.id}::uuid
      LIMIT 1
    `;
    training = tr ?? null;

    const [act] = await tx<
      {
        profileLinkVerified: boolean;
        invoiceGenerated: boolean;
        contractGenerated: boolean;
        activatedAt: string | null;
      }[]
    >`
      SELECT
        profile_link_verified AS "profileLinkVerified",
        invoice_generated AS "invoiceGenerated",
        contract_generated AS "contractGenerated",
        activated_at AS "activatedAt"
      FROM sales.activation_log
      WHERE pipeline_id = ${pipeline.id}::uuid
      LIMIT 1
    `;
    activation = act ?? null;
  }

  const rmCommsRaw: RmCommRow[] = await tx<RmCommRow[]>`
    SELECT
      c.id,
      c.entry_type::text AS "entryType",
      c.description,
      c.created_at AS "createdAt",
      s.name AS "actorName",
      bl.display_id AS "leadDisplayId",
      bl.bride_name AS "leadName",
      COALESCE(c.metadata, '{}'::jsonb) AS metadata,
      bl.shifted_at AS "shiftedAt",
      bl.status::text AS "leadStatus"
    FROM comms c
    LEFT JOIN staff s ON s.id = c.actor_id
    LEFT JOIN bride_leads bl ON bl.id = c.lead_id
    WHERE (
        c.mua_id = ${muaId}::uuid
        OR (c.entry_type = 'mua_pushed' AND c.metadata->>'muaId' = ${muaId})
        OR (
          c.entry_type = 'booking_confirmed'
          AND EXISTS (
            SELECT 1 FROM bookings bk
            WHERE bk.mua_id = ${muaId}::uuid AND bk.lead_id = c.lead_id
          )
        )
      )
    ORDER BY c.created_at DESC
    LIMIT 300
  `;

  const salesCommsRaw: SalesCommRow[] = await tx<SalesCommRow[]>`
    SELECT
      scl.id,
      scl.entry_type::text AS "entryType",
      scl.description,
      scl.created_at AS "createdAt",
      s.name AS "actorName",
      COALESCE(scl.metadata, '{}'::jsonb) AS metadata
    FROM sales.comms_log scl
    JOIN sales.pipeline p ON p.id = scl.pipeline_id
    LEFT JOIN staff s ON s.id = scl.actor_id
    WHERE p.mua_id = ${muaId}::uuid
    ORDER BY scl.created_at DESC
    LIMIT 200
  `;

  const pushRows: PushRow[] = await tx<PushRow[]>`
    SELECT
      mp.id,
      mp.stage::text,
      mp.status::text,
      mp.created_at AS "createdAt",
      bl.display_id AS "leadDisplayId",
      bl.bride_name AS "brideName",
      bl.status::text AS "leadStatus",
      bl.shifted_at AS "shiftedAt",
      s.name AS "rmName"
    FROM mua_pushes mp
    JOIN bride_leads bl ON bl.id = mp.lead_id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    WHERE mp.mua_id = ${muaId}::uuid
    ORDER BY mp.created_at DESC
    LIMIT 100
  `;

  const bookingRows: BookingRow[] = await tx<BookingRow[]>`
    SELECT
      b.id,
      bl.display_id AS "leadDisplayId",
      bl.bride_name AS "brideName",
      b.booked_price AS "bookedPrice",
      b.advance_paid AS "advancePaid",
      b.created_at AS "createdAt"
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    WHERE b.mua_id = ${muaId}::uuid AND NOT b.cancelled
    ORDER BY b.created_at DESC
    LIMIT 50
  `;

  const careEvents: InvestigationLedgerEntry[] = [];

  if (ticketId) {
    const comments = await tx<
      {
        id: string;
        body: string;
        isInternal: boolean;
        isAiGenerated: boolean;
        aiMode: string | null;
        authorName: string | null;
        createdAt: string;
      }[]
    >`
      SELECT
        c.id,
        c.body,
        c.is_internal AS "isInternal",
        c.is_ai_generated AS "isAiGenerated",
        c.ai_mode AS "aiMode",
        s.name AS "authorName",
        c.created_at AS "createdAt"
      FROM support.ticket_comments c
      LEFT JOIN staff s ON s.id = c.author_id
      WHERE c.ticket_id = ${ticketId}::uuid
      ORDER BY c.created_at DESC
      LIMIT 100
    `;

    for (const c of comments) {
      const prefix = c.isAiGenerated ? "AI" : c.isInternal ? "Internal note" : "Comment";
      careEvents.push({
        id: `ticket-comment-${c.id}`,
        source: "care",
        entryType: c.isAiGenerated ? "ai_advisor" : "ticket_comment",
        description: `[${prefix}] ${c.body.slice(0, 500)}${c.body.length > 500 ? "…" : ""}`,
        createdAt: c.createdAt,
        actorName: c.authorName ?? (c.isAiGenerated ? "AI Advisor" : null),
        leadDisplayId: null,
        leadName: null,
        metadata: { aiMode: c.aiMode, isInternal: c.isInternal },
      });
    }

    const statusHistory = await tx<
      { id: string; fromStatus: string | null; toStatus: string; changedByName: string | null; reason: string | null; createdAt: string }[]
    >`
      SELECT
        h.id,
        h.from_status::text AS "fromStatus",
        h.to_status::text AS "toStatus",
        s.name AS "changedByName",
        h.reason,
        h.created_at AS "createdAt"
      FROM support.ticket_status_history h
      LEFT JOIN staff s ON s.id = h.changed_by
      WHERE h.ticket_id = ${ticketId}::uuid
      ORDER BY h.created_at DESC
      LIMIT 50
    `;

    for (const h of statusHistory) {
      const from = h.fromStatus ? h.fromStatus.replace(/_/g, " ") : "new";
      const to = h.toStatus.replace(/_/g, " ");
      careEvents.push({
        id: `ticket-status-${h.id}`,
        source: "care",
        entryType: "status_change",
        description: `Status: ${from} → ${to}${h.reason ? ` (${h.reason})` : ""}`,
        createdAt: h.createdAt,
        actorName: h.changedByName,
        leadDisplayId: null,
        leadName: null,
        metadata: {},
      });
    }

    const escalations = await tx<
      { id: string; toLevel: number; reason: string | null; escalatedByName: string | null; createdAt: string }[]
    >`
      SELECT
        e.id,
        e.to_level AS "toLevel",
        e.reason,
        s.name AS "escalatedByName",
        e.created_at AS "createdAt"
      FROM support.ticket_escalations e
      LEFT JOIN staff s ON s.id = e.escalated_by
      WHERE e.ticket_id = ${ticketId}::uuid
      ORDER BY e.created_at DESC
      LIMIT 20
    `;

    for (const e of escalations) {
      careEvents.push({
        id: `ticket-escalation-${e.id}`,
        source: "care",
        entryType: "escalation",
        description: `Escalated to L${e.toLevel}${e.reason ? `: ${e.reason}` : ""}`,
        createdAt: e.createdAt,
        actorName: e.escalatedByName,
        leadDisplayId: null,
        leadName: null,
        metadata: { toLevel: e.toLevel },
      });
    }

    const emails = await tx<
      { id: string; subject: string; status: string; sentByName: string | null; createdAt: string }[]
    >`
      SELECT
        er.id,
        er.subject,
        er.status::text AS status,
        s.name AS "sentByName",
        er.created_at AS "createdAt"
      FROM support.ticket_email_responses er
      LEFT JOIN staff s ON s.id = er.sent_by
      WHERE er.ticket_id = ${ticketId}::uuid
      ORDER BY er.created_at DESC
      LIMIT 30
    `;

    for (const em of emails) {
      careEvents.push({
        id: `ticket-email-${em.id}`,
        source: "care",
        entryType: "care_email",
        description: `Email (${em.status}): ${em.subject}`,
        createdAt: em.createdAt,
        actorName: em.sentByName,
        leadDisplayId: null,
        leadName: null,
        metadata: { status: em.status },
      });
    }

    const completedTasks = await tx<
      { id: string; displayId: string; title: string; taskType: string; assigneeName: string | null; updatedAt: string }[]
    >`
      SELECT
        tt.id,
        tt.display_id AS "displayId",
        tt.title,
        tt.task_type::text AS "taskType",
        s.name AS "assigneeName",
        tt.updated_at AS "updatedAt"
      FROM support.ticket_tasks tt
      LEFT JOIN staff s ON s.id = tt.assigned_to
      WHERE tt.ticket_id = ${ticketId}::uuid AND tt.status = 'done'
      ORDER BY tt.updated_at DESC
      LIMIT 30
    `;

    for (const t of completedTasks) {
      careEvents.push({
        id: `ticket-task-${t.id}`,
        source: "care",
        entryType: "care_task_completed",
        description: `Task done: ${t.displayId} — ${t.title}`,
        createdAt: t.updatedAt,
        actorName: t.assigneeName,
        leadDisplayId: null,
        leadName: null,
        metadata: { taskType: t.taskType },
      });
    }
  }

  const rmLedgerEntries = rmCommsRaw.map((r) => toLedgerEntry(r));
  const salesLedgerEntries: InvestigationLedgerEntry[] = salesCommsRaw.map((r) => ({
    id: r.id,
    source: "sales" as const,
    entryType: r.entryType,
    description: r.description,
    createdAt: r.createdAt,
    actorName: r.actorName,
    leadDisplayId: null,
    leadName: null,
    metadata: r.metadata ?? {},
  }));

  const rmComms = rmLedgerEntries.filter((e) => e.source === "rm");
  const commissionComms = rmLedgerEntries.filter((e) => e.source === "commission");

  const pushes: InvestigationPush[] = pushRows.map((p) => {
    const phase = pushPhase(p.createdAt, p.shiftedAt, p.leadStatus);
    return { ...p, phase };
  });

  const rmPushes = pushes.filter((p) => p.phase === "rm");
  const commissionPushes = pushes.filter((p) => p.phase === "commission");

  const bookings: InvestigationBooking[] = bookingRows.map((b) => ({
    ...b,
    bookedPrice: Number(b.bookedPrice),
    advancePaid: b.advancePaid != null ? Number(b.advancePaid) : null,
  }));

  const ledger = [...rmLedgerEntries, ...salesLedgerEntries, ...careEvents]
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 500);

  return {
    mua,
    bride,
    sales: {
      pipeline: pipeline ?? null,
      onboarding,
      training,
      activation,
      comms: salesLedgerEntries,
    },
    rm: {
      assignedRmName: mua.assignedRmName,
      pushes: rmPushes,
      comms: rmComms,
      bookings: [],
      stats: { pushes: rmPushes.length, bookings: bookings.length },
    },
    commission: {
      pushes: commissionPushes,
      comms: commissionComms,
      bookings,
      stats: { pushes: commissionPushes.length, bookings: bookings.length },
    },
    ledger,
  };
}
