import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { COMM } from "@/lib/comm-types";
import type { CommEntryType } from "@/lib/types";

const DB_TO_ENTRY: Record<string, CommEntryType> = Object.fromEntries(
  Object.entries(COMM).map(([k, v]) => [v, k as CommEntryType])
) as Record<string, CommEntryType>;

function normalizeEntryType(raw: string): CommEntryType {
  if (raw === "callyzerSynced") {
    return "callLogged";
  }
  if (raw === "emailLogged" || raw === "activationUpdated" || raw === "onboardingUpdated" || raw === "trainingUpdated") {
    return "note";
  }
  return DB_TO_ENTRY[raw] ?? (raw as CommEntryType);
}

export interface MuaCommRow {
  id: string;
  leadId: string | null;
  entryType: CommEntryType;
  description: string;
  actorId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  leadName: string | null;
  leadDisplayId: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getMuaComms(id),
      error: null,
    });
  }

  const rows = await sql<any[]>`
    SELECT
      c.id,
      c.lead_id,
      c.entry_type,
      c.description,
      c.actor_id,
      s.name AS actor_name,
      c.metadata,
      c.created_at,
      bl.bride_name AS lead_name,
      bl.display_id AS lead_display_id
    FROM comms c
    JOIN bride_leads bl ON bl.id = c.lead_id
    LEFT JOIN staff s ON s.id = c.actor_id
    WHERE c.mua_id = ${id}::uuid
    ORDER BY c.created_at DESC
    LIMIT 100
  `;

  const salesRows = await sql<any[]>`
    SELECT
      scl.id,
      NULL::uuid AS lead_id,
      scl.entry_type,
      scl.description,
      scl.actor_id,
      s.name AS actor_name,
      scl.metadata,
      scl.created_at,
      NULL::text AS lead_name,
      NULL::text AS lead_display_id
    FROM sales.comms_log scl
    JOIN sales.pipeline p ON p.id = scl.pipeline_id
    LEFT JOIN staff s ON s.id = scl.actor_id
    WHERE p.mua_id = ${id}::uuid
    ORDER BY scl.created_at DESC
    LIMIT 100
  `;

  const data: MuaCommRow[] = [...rows, ...salesRows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100)
    .map((r) => ({
      id: r.id,
      leadId: r.leadId,
      entryType: normalizeEntryType(String(r.entryType)),
      description: String(r.description ?? ""),
      actorId: r.actorId,
      actorName: r.actorName ?? (r.metadata?.staffName as string | undefined) ?? null,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt,
      leadName: r.leadName,
      leadDisplayId: r.leadDisplayId,
    }));

  return NextResponse.json({ data, error: null });
}
