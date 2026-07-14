import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { LeadEvent } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  if (USE_MOCK) {
    const data = mockStore.getLeadEvents(id);
    return NextResponse.json({ data, error: null });
  }

  const rows = await sql<LeadEvent[]>`
    SELECT * FROM lead_events
    WHERE lead_id = ${id}::uuid
    ORDER BY event_date NULLS LAST, ceremony_type
  `;

  return NextResponse.json({ data: rows, error: null });
}
