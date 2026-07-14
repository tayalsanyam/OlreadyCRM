import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { bootstrapSalesPipelinesForMuas } from "@/lib/bootstrap-sales-pipeline";
import { BOOTSTRAP_PIPELINE_BATCH_SIZE } from "@/lib/bootstrap-sales-pipeline-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner", "salesTl"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    muaIds?: string[];
    salesRmId?: string | null;
  };

  const muaIds = [...new Set(body.muaIds?.filter(Boolean) ?? [])];
  if (!muaIds.length) {
    return NextResponse.json({ data: null, error: "Select at least one MUA" }, { status: 400 });
  }
  if (muaIds.length > BOOTSTRAP_PIPELINE_BATCH_SIZE) {
    return NextResponse.json(
      { data: null, error: `Max ${BOOTSTRAP_PIPELINE_BATCH_SIZE} MUAs per request` },
      { status: 400 },
    );
  }

  try {
    const data = await withTransaction(async (tx) =>
      bootstrapSalesPipelinesForMuas(tx, muaIds, {
        actorId: auth.session.userId,
        salesRmId: body.salesRmId ?? null,
      }),
    );

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Pipeline bootstrap failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
