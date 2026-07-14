import { NextResponse } from "next/server";
import { sql, withTransaction, appendComm, insertAuditLog } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { normalizeCommEntry } from "@/lib/db-mappers";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { leadCommsToCsv } from "@/lib/lead-comms-export";
import type { CommEntry } from "@/lib/types";

function leadLogCsvResponse(slug: string, csv: string): Response {
  const safe = slug.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-log-${safe}-${date}.csv"`,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const isCsv = format === "csv";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? (isCsv ? "10000" : "50")), 1),
    isCsv ? 10000 : 100
  );

  if (USE_MOCK) {
    const data = mockStore.getLead(id);
    if (!data) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    const comms = (data.comms ?? []).slice(-limit).reverse();
    if (isCsv) {
      const lead = data.lead;
      const csv = leadCommsToCsv(comms, {
        displayId: lead.displayId,
        brideName: lead.brideName,
        region: lead.region ?? undefined,
        eventDate: lead.eventDate ?? undefined,
      });
      const slug = lead.displayId;
      return leadLogCsvResponse(slug, csv);
    }
    return NextResponse.json({ data: comms, error: null });
  }

  const accessRow = await getLeadForAccess(id);
  if (!accessRow) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  if (!canAccessLead(auth.session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql<CommEntry[]>`
    SELECT c.*, s.name AS actor_name, s.role AS actor_role
    FROM comms c
    LEFT JOIN staff s ON s.id = c.actor_id
    WHERE c.lead_id = ${id}::uuid
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `;

  const comms = rows.map((c) => normalizeCommEntry(c));

  if (isCsv) {
    const [leadMeta] = await sql<
      { displayId: string; brideName: string; region: string; eventDate: string | null }[]
    >`
      SELECT
        display_id AS "displayId",
        bride_name AS "brideName",
        region::text AS region,
        event_date::text AS "eventDate"
      FROM bride_leads
      WHERE id = ${id}::uuid
    `;
    const csv = leadCommsToCsv(comms, {
      displayId: leadMeta?.displayId ?? id,
      brideName: leadMeta?.brideName ?? "",
      region: leadMeta?.region,
      eventDate: leadMeta?.eventDate ?? undefined,
    });
    const slug = leadMeta?.displayId ?? id;
    return leadLogCsvResponse(slug, csv);
  }

  return NextResponse.json({
    data: comms,
    error: null,
  });
}

const TYPE_MAP = {
  call: COMM.callLogged,
  whatsapp: COMM.whatsappLogged,
  note: COMM.note,
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    type?: "call" | "whatsapp" | "note";
    entryType?: "stageUpdated";
    description: string;
    durationMinutes?: number;
    muaId?: string;
    metadata?: Record<string, unknown>;
  };

  const { session } = auth;

  if (!body.description?.trim()) {
    return NextResponse.json(
      { data: null, error: "description required" },
      { status: 400 }
    );
  }

  if (body.entryType === "stageUpdated") {
    if (USE_MOCK) {
      mockStore.addCommEntry(
        id,
        "stageUpdated",
        body.description,
        session.userId,
        session.name
      );
      return NextResponse.json({ data: { ok: true }, error: null });
    }
    const lead = await getLeadForAccess(id);
    if (!lead || !canAccessLead(session, lead)) {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    await withTransaction(async (tx) => {
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.stageUpdated,
        description: body.description,
        actorId: session.userId,
        metadata: body.metadata,
      });
    });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (!body.type) {
    return NextResponse.json(
      { data: null, error: "type required" },
      { status: 400 }
    );
  }

  if (USE_MOCK) {
    mockStore.addCommEntry(
      id,
      body.type === "call"
        ? "callLogged"
        : body.type === "whatsapp"
          ? "whatsappLogged"
          : "note",
      body.description,
      session.userId,
      session.name
    );
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  const lead = await getLeadForAccess(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const desc =
    body.type === "call" && body.durationMinutes
      ? `${body.description} (${body.durationMinutes} min)`
      : body.description;

  await withTransaction(async (tx) => {
    await appendComm(tx, {
      leadId: id,
      entryType: TYPE_MAP[body.type!],
      description: desc,
      actorId: session.userId,
      muaId: body.muaId ?? (body.metadata?.muaId as string | undefined) ?? null,
      metadata: body.metadata,
    });
    await insertAuditLog(tx, {
      tableName: "comms",
      recordId: id,
      action: "log_comm",
      actorId: session.userId,
      changes: body,
    });
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
