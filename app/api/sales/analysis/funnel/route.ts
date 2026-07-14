import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { PIPELINE_STAGE_ORDER } from "@/lib/types";
import { resolveTlTeamMemberIds } from "@/lib/sales-report-scope";

export async function GET(request: Request) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("date_from");
  const toRaw = searchParams.get("date_to");
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;

  const rows = await withTransaction(async (tx) => {
    let scoped = tx`TRUE`;
    if (auth.session.role === "salesTl") {
      const memberIds = await resolveTlTeamMemberIds(tx, auth.session.userId);
      scoped = tx`assigned_to = ANY(${memberIds}::uuid[])`;
    }
    const all = await tx`
      SELECT stage, COUNT(*)::int AS count
      FROM sales.pipeline
      WHERE ${scoped}
        AND (${from}::date IS NULL OR updated_at::date >= ${from}::date)
        AND (${to}::date IS NULL OR updated_at::date <= ${to}::date)
      GROUP BY stage
    `;
    const map = new Map<string, number>(all.map((r: any) => [String(r.stage), Number(r.count)]));
    return PIPELINE_STAGE_ORDER.map((s, idx) => {
      const count = map.get(s) ?? 0;
      if (idx === 0) return { stage: s, count, stageToStageConversionPct: 100 };
      const prev = map.get(PIPELINE_STAGE_ORDER[idx - 1]!) ?? 0;
      const pct = prev > 0 ? Number(((count / prev) * 100).toFixed(2)) : 0;
      return { stage: s, count, stageToStageConversionPct: pct };
    });
  });

  return NextResponse.json({ data: rows, error: null });
}
