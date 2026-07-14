import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";

const ALLOWED = new Set(["hot", "follow_up", "nurturing", "cold"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    priorityTag?: "hot" | "follow_up" | "nurturing" | "cold" | null;
  };
  if (body.priorityTag !== null && body.priorityTag !== undefined && !ALLOWED.has(body.priorityTag)) {
    return NextResponse.json({ data: null, error: "Invalid priorityTag" }, { status: 400 });
  }

  const row = await withTransaction(async (tx) => {
    const [pipeline] = await tx<{ id: string; assignedTo: string | null; teamId: string | null }[]>`
      SELECT
        p.id,
        p.assigned_to AS "assignedTo",
        s.team_id AS "teamId"
      FROM sales.pipeline p
      LEFT JOIN staff s ON s.id = p.assigned_to
      WHERE p.id = ${id}::uuid
      LIMIT 1
    `;
    if (!pipeline) throw new Error("Pipeline not found");

    if (auth.session.role === "salesRm" && pipeline.assignedTo !== auth.session.userId) {
      throw new Error("Forbidden");
    }
    if (auth.session.role === "salesTl") {
      const [self] = await tx<{ teamId: string | null }[]>`
        SELECT team_id AS "teamId" FROM staff WHERE id = ${auth.session.userId}::uuid
      `;
      if (!self?.teamId || self.teamId !== pipeline.teamId) {
        throw new Error("Forbidden");
      }
    }

    const [updated] = await tx`
      UPDATE sales.pipeline
      SET priority_tag = ${body.priorityTag ?? null},
          updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, priority_tag AS "priorityTag", updated_at AS "updatedAt"
    `;
    return updated;
  }).catch((e: Error) => {
    if (e.message === "Pipeline not found") return null;
    if (e.message === "Forbidden") return "forbidden";
    throw e;
  });

  if (row === null) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  if (row === "forbidden") {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data: row, error: null });
}
