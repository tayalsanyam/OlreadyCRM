import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const format = new URL(request.url).searchParams.get("format");

  const rows = await sql`
    SELECT
      mp.*,
      bl.bride_name AS "brideName",
      bl.display_id AS "displayId",
      t.status AS "taskStatus"
    FROM mua_prospects mp
    LEFT JOIN bride_leads bl ON bl.id = mp.lead_id
    LEFT JOIN rm_tasks t ON t.id = mp.task_id
    ORDER BY mp.created_at DESC
  `;

  if (format === "csv") {
    const header = "ID,Lead,MUA Name,Insta ID,Phone,City,Status,Created At";
    const lines = rows.map((r) =>
      [
        r.id,
        r.displayId ?? "",
        `"${String(r.nonOlreadyMuaName).replace(/"/g, '""')}"`,
        r.instaId ?? "",
        r.phone ?? "",
        r.city ?? "",
        r.status,
        r.createdAt,
      ].join(",")
    );
    return new NextResponse([header, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="mua-prospects.csv"',
      },
    });
  }

  return NextResponse.json({ data: rows, error: null });
}
