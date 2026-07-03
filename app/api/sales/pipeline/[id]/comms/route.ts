import { NextResponse } from "next/server";
import { requireSalesAccess } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { appendSalesEventToRmComms } from "@/lib/sales-ledger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAccess();
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { id } = await params;
  const url = new URL(_request.url);
  const salesOffset = Math.max(0, Number(url.searchParams.get("salesOffset") ?? "0") || 0);
  const priorOffset = Math.max(0, Number(url.searchParams.get("priorOffset") ?? "0") || 0);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));

  const data = await withTransaction(async (tx) => {
    const [pipe] = await tx<{ id: string; muaId: string; muaType: string }[]>`
      SELECT id, mua_id AS "muaId", mua_type AS "muaType" FROM sales.pipeline WHERE id = ${id}::uuid
    `;
    if (!pipe) return null;

    const sales = await tx`
      SELECT
        'sales'::text AS source,
        cl.id,
        cl.entry_type AS "entryType",
        cl.description,
        cl.actor_id AS "actorId",
        s.name AS "actorName",
        cl.metadata,
        cl.created_at AS "createdAt"
      FROM sales.comms_log cl
      LEFT JOIN staff s ON s.id = cl.actor_id
      WHERE pipeline_id = ${id}::uuid
      ORDER BY cl.created_at DESC
      LIMIT ${limit}
      OFFSET ${salesOffset}
    `;
    const [salesCountRow] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM sales.comms_log WHERE pipeline_id = ${id}::uuid
    `;

    const prior = await tx`
      SELECT
        'rm'::text AS source,
        c.id,
        c.entry_type AS "entryType",
        c.description,
        c.actor_id AS "actorId",
        s.name AS "actorName",
        c.metadata,
        c.created_at AS "createdAt"
      FROM comms c
      LEFT JOIN staff s ON s.id = c.actor_id
      WHERE mua_id = ${pipe.muaId}::uuid
      ORDER BY c.created_at DESC
      LIMIT ${limit}
      OFFSET ${priorOffset}
    `;
    const [priorCountRow] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM comms WHERE mua_id = ${pipe.muaId}::uuid
    `;
    const priorCount = priorCountRow?.count ?? 0;

    return {
      sales,
      prior,
      page: {
        limit,
        salesOffset,
        priorOffset,
        salesTotal: salesCountRow?.count ?? 0,
        priorTotal: priorCount,
      },
    };
  });

  if (!data) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  return NextResponse.json({ data, error: null });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAccess();
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { entryType?: string; description?: string; metadata?: Record<string, unknown> };
  const allowedTypes = new Set(["callLogged", "whatsappLogged", "emailLogged", "stageChanged", "noteAdded", "onboardingUpdated", "trainingUpdated", "activationUpdated", "callyzerSynced"]);

  if (!body.entryType || !allowedTypes.has(body.entryType) || !body.description?.trim()) {
    return NextResponse.json({ data: null, error: "entryType and description are required" }, { status: 400 });
  }
  const description = body.description.trim();
  if (body.entryType === "noteAdded" && description.length < 10) {
    return NextResponse.json({ data: null, error: "Note must be at least 10 characters" }, { status: 400 });
  }

  const row = await withTransaction(async (tx) => {
    const [pipe] = await tx<{ muaId: string | null }[]>`SELECT mua_id AS "muaId" FROM sales.pipeline WHERE id = ${id}::uuid`;
    if (!pipe) throw new Error("Pipeline not found");

    const [ins] = await tx`
      INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
      VALUES (${id}::uuid, ${body.entryType}, ${description}, ${auth.session.userId}::uuid, ${tx.json(body.metadata ?? {})})
      RETURNING *
    `;

    await appendSalesEventToRmComms(tx, {
      muaId: pipe.muaId,
      actorId: auth.session.userId,
      description: `[Sales] ${description}`,
      metadata: { pipelineId: id, entryType: body.entryType, ...(body.metadata ?? {}) },
    });

    return ins;
  });

  return NextResponse.json({ data: row, error: null });
}
