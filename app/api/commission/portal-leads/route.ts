import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { normalizeLeadFull } from "@/lib/db-mappers";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { LeadFull } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoles(["commissionRm", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: mockStore.getPortalLeads(), error: null });
  }

  try {
    const rows = await sql<LeadFull[]>`
      SELECT
        bl.*,
        rm.compute_urgency_band(bl.event_date) AS urgency_band,
        (bl.event_date - CURRENT_DATE)::int AS days_to_event,
        NULL::int AS assignment_days_remaining,
        NULL::int AS days_since_assignment,
        NULL::text AS assigned_rm_name,
        0::int AS active_pushes_count,
        0::int AS muas_offered_count,
        NULL::text AS muas_offered_names,
        0::int AS event_count,
        0::int AS booked_event_count,
        0::int AS open_event_count,
        NULL::text AS event_labels,
        NULL::timestamptz AS last_activity_at
      FROM bride_leads bl
      WHERE bl.portal_only = true
        AND bl.status = 'verified'
        AND bl.assigned_rm_id IS NULL
      ORDER BY bl.event_date ASC NULLS LAST
      LIMIT 100
    `;

    return NextResponse.json({
      data: rows.map((r) => normalizeLeadFull(r)),
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Portal leads query failed";
    console.error("GET /api/commission/portal-leads:", message);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
