import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import type { Region } from "@/lib/types";

const ALLOWED_ROLES = new Set([
  "regionalRm",
  "commissionRm",
  "leadUploader",
  "admin",
  "owner",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  if (!ALLOWED_ROLES.has(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const access = await getLeadForAccess(id);
  if (!access) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  if (!canAccessLead(auth.session, access)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    brideName?: string;
    phone?: string;
    email?: string | null;
    city?: string;
    region?: Region;
    eventLocation?: string | null;
    groupSize?: number | null;
    groupNotes?: string | null;
  };

  const groupSizeProvided = body.groupSize !== undefined;
  const nextGroupSize: number | null = body.groupSize ?? null;

  await sql`
    UPDATE bride_leads SET
      bride_name = COALESCE(${body.brideName?.trim() ?? null}, bride_name),
      phone = COALESCE(${body.phone?.trim() ?? null}, phone),
      email = CASE WHEN ${body.email !== undefined} THEN ${body.email?.trim() || null} ELSE email END,
      city = COALESCE(${body.city?.trim() ?? null}, city),
      region = CASE WHEN ${body.region !== undefined} THEN ${body.region ?? null}::region ELSE region END,
      event_location = CASE WHEN ${body.eventLocation !== undefined} THEN ${body.eventLocation?.trim() || null} ELSE event_location END,
      group_size = CASE WHEN ${groupSizeProvided} THEN ${nextGroupSize} ELSE group_size END,
      group_notes = CASE WHEN ${body.groupNotes !== undefined} THEN ${body.groupNotes?.trim() || null} ELSE group_notes END,
      updated_at = NOW()
    WHERE id = ${id}::uuid
  `;

  const [lead] = await sql`SELECT * FROM leads_full WHERE id = ${id}::uuid`;
  return NextResponse.json({ data: { lead }, error: null });
}
