import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import type { Region } from "@/lib/types";
import { fetchNiLeads, niLeadsToCsv, type NiLeadSource } from "@/lib/ni-leads-query";

export const dynamic = "force-dynamic";

function parseNiSource(raw: string | null): NiLeadSource | null {
  if (raw === "regional" || raw === "commission") return raw;
  return null;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  const data = await fetchNiLeads({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    region: searchParams.get("region") as Region | null,
    rmId: searchParams.get("rmId"),
    niSource: parseNiSource(searchParams.get("niSource")),
  });

  if (format === "csv") {
    return new NextResponse(niLeadsToCsv(data), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="ni-leads.csv"',
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
