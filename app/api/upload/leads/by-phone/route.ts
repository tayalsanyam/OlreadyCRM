import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { fetchLeadsByPhoneHistory } from "@/lib/lead-phone-history";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const params = new URL(request.url).searchParams;
  const phone = params.get("phone")?.trim() ?? "";
  const excludeLeadId = params.get("excludeId")?.trim() || null;

  if (!phone) {
    return NextResponse.json({ data: null, error: "phone is required" }, { status: 400 });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getLeadsByPhoneHistory(phone, excludeLeadId),
      error: null,
    });
  }

  const data = await fetchLeadsByPhoneHistory(sql, { phone, excludeLeadId });
  return NextResponse.json({ data, error: null });
}
