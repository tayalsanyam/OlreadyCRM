import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const report = url.searchParams.get("report") ?? "overview";
  const routeByReport: Record<string, string> = {
    overview: "/api/admin/sales/reports/overview",
    source: "/api/admin/sales/reports/source-analysis",
    funnel: "/api/admin/sales/reports/conversion-funnel",
    revenue: "/api/admin/sales/reports/revenue",
    calls: "/api/admin/sales/reports/call-activity",
    targets: "/api/admin/sales/reports/target-tracking",
    activationQueue: "/api/admin/sales/reports/activation-queue",
    churned: "/api/admin/sales/reports/churned-muas",
  };
  const route = routeByReport[report] ?? routeByReport.overview;

  const forward = new URLSearchParams(url.searchParams);
  forward.delete("report");

  const qs = forward.toString();
  const res = await fetch(`${url.origin}${route}${qs ? `?${qs}` : ""}`, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  const json = await res.json();
  const rows =
    report === "targets" && json.data && !Array.isArray(json.data)
      ? ((json.data as { members?: Record<string, unknown>[] }).members ?? [])
      : ((json.data ?? []) as Record<string, unknown>[]);

  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = r[h];
          const s = v == null ? "" : String(v).replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sales-${report}.csv"`,
    },
  });
}
