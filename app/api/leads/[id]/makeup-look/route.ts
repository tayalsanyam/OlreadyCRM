import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { getMakeupLookProfile, upsertMakeupLookProfile } from "@/lib/makeup-look-db";
import type { MakeupLookProfileInput } from "@/lib/makeup-look";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const access = await getLeadForAccess(id);
  if (!access) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  if (!canAccessLead(auth.session, access)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const profile = await getMakeupLookProfile(sql, id);
  return NextResponse.json({ data: profile, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const access = await getLeadForAccess(id);
  if (!access) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  if (!canAccessLead(auth.session, access)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as MakeupLookProfileInput;
  await upsertMakeupLookProfile(sql, id, body);
  const profile = await getMakeupLookProfile(sql, id);
  return NextResponse.json({ data: profile, error: null });
}
