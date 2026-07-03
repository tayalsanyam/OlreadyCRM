import { NextResponse } from "next/server";
import { withTransaction, insertAuditLog, setAuditActor } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { createUnassignedSalesPipeline } from "@/lib/sales-pipeline-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    muaIds?: string[];
    status?: string;
  };

  const ids = body.muaIds?.filter(Boolean) ?? [];
  if (!ids.length) {
    return NextResponse.json({ data: null, error: "No MUAs selected" }, { status: 400 });
  }

  const status = body.status === "inactive" ? "inactive" : body.status === "active" ? "active" : null;
  if (!status) {
    return NextResponse.json(
      { data: null, error: "status must be active or inactive" },
      { status: 400 },
    );
  }

  try {
    const updated = await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);

      const rows = await tx<{ id: string }[]>`
        UPDATE muas
        SET status = ${status}, updated_at = NOW()
        WHERE id = ANY(${ids}::uuid[])
        RETURNING id
      `;

      for (const row of rows) {
        await insertAuditLog(tx, {
          tableName: "muas",
          recordId: row.id,
          action: "bulk_roster_status",
          actorId: auth.session.userId,
          changes: { status },
        });

        if (status === "active") {
          const [mua] = await tx<{ name: string }[]>`
            SELECT name FROM muas WHERE id = ${row.id}::uuid
          `;
          await createUnassignedSalesPipeline(tx, {
            muaId: row.id,
            actorId: auth.session.userId,
            muaName: mua?.name,
          });
        }
      }

      return rows.length;
    });

    return NextResponse.json({ data: { updated }, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bulk roster update failed";
    console.error("PATCH /api/admin/muas/bulk-roster:", message);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
