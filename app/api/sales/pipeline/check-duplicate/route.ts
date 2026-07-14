import { NextResponse } from "next/server";
import { requireSalesAccess } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export async function GET(request: Request) {
  const auth = await requireSalesAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const phone = new URL(request.url).searchParams.get("phone")?.trim();
  const excludeMuaId = new URL(request.url).searchParams.get("exclude_mua_id");
  if (!phone) {
    return NextResponse.json({ data: null, error: "phone is required" }, { status: 400 });
  }

  const normalized = normalizePhone(phone);
  if (normalized.length < 10) {
    return NextResponse.json({ data: { matches: [] }, error: null });
  }

  const matches = await withTransaction(async (tx) => tx`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      m.phone,
      p.id AS "pipelineId",
      p.stage,
      p.mua_type AS "muaType",
      p.status AS "pipelineStatus",
      s.name AS "assignedToName"
    FROM muas m
    LEFT JOIN sales.pipeline p ON p.mua_id = m.id AND p.status = 'active'
    LEFT JOIN staff s ON s.id = p.assigned_to
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
      AND (${excludeMuaId ?? null}::uuid IS NULL OR m.id <> ${excludeMuaId ?? null}::uuid)
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 5
  `);

  return NextResponse.json({
    data: { matches, hasDuplicate: matches.length > 0 },
    error: null,
  });
}
