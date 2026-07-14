import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";

export async function GET(request: Request) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const teamId = url.searchParams.get("team_id");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("page_size") ?? "25")));
  const offset = (page - 1) * pageSize;
  const params = new URLSearchParams(url.searchParams);
  params.delete("team_id");
  params.delete("page");
  params.delete("page_size");

  if (teamId && (auth.session.role === "admin" || auth.session.role === "owner")) {
    const ids = await withTransaction(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        SELECT id FROM staff WHERE team_id = ${teamId}::uuid AND active = true
      `;
      return rows.map((r: { id: string }) => r.id);
    });
    if (ids.length === 0) return NextResponse.json({ data: [], error: null });
    const proxyAll = `${url.origin}/api/sales/pipeline?${params.toString()}`;
    const allRes = await fetch(proxyAll, { headers: { cookie: request.headers.get("cookie") ?? "" } });
    const allJson = (await allRes.json()) as { data?: Array<{ assignedTo: string | null }> };
    const allowed = new Set(ids);
    const filtered = (allJson.data ?? []).filter((r) => r.assignedTo && allowed.has(r.assignedTo));
    return NextResponse.json({
      data: filtered.slice(offset, offset + pageSize),
      page: { page, pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) },
      error: null,
    });
  }

  const proxy = `${url.origin}/api/sales/pipeline?${params.toString()}`;
  const res = await fetch(proxy, { headers: { cookie: request.headers.get("cookie") ?? "" } });
  const json = await res.json();
  const all = json.data ?? [];
  return NextResponse.json(
    {
      data: all.slice(offset, offset + pageSize),
      page: { page, pageSize, total: all.length, totalPages: Math.max(1, Math.ceil(all.length / pageSize)) },
      error: json.error ?? null,
    },
    { status: res.status }
  );
}
