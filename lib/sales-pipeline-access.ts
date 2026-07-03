import type { TransactionSql } from "@/db/index";
import type { SessionUser } from "@/lib/types";
import { getSalesTeamId } from "@/lib/sales-report-scope";

export type PipelineAccessRow = {
  id: string;
  muaId: string;
  assignedTo: string | null;
  muaType: string;
  stage: string;
  status: string;
};

export async function loadPipelineForAccess(
  tx: TransactionSql,
  pipelineId: string,
): Promise<PipelineAccessRow | null> {
  const [row] = await tx<PipelineAccessRow[]>`
    SELECT
      p.id,
      p.mua_id AS "muaId",
      p.assigned_to AS "assignedTo",
      p.mua_type AS "muaType",
      p.stage,
      p.status
    FROM sales.pipeline p
    WHERE p.id = ${pipelineId}::uuid
    LIMIT 1
  `;
  return row ?? null;
}

export async function assertPipelineAccess(
  tx: TransactionSql,
  session: Pick<SessionUser, "userId" | "role">,
  pipelineId: string,
): Promise<PipelineAccessRow> {
  const pipe = await loadPipelineForAccess(tx, pipelineId);
  if (!pipe) throw Object.assign(new Error("Pipeline not found"), { status: 404 });

  if (session.role === "salesRm") {
    if (pipe.assignedTo !== session.userId) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return pipe;
  }

  if (session.role === "salesTl") {
    const teamId = await getSalesTeamId(tx, session.userId);
    if (!teamId) {
      if (pipe.assignedTo === session.userId || !pipe.assignedTo) return pipe;
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    if (!pipe.assignedTo) return pipe;
    if (pipe.assignedTo === session.userId) return pipe;
    const [member] = await tx<{ id: string }[]>`
      SELECT id FROM staff
      WHERE id = ${pipe.assignedTo}::uuid AND team_id = ${teamId}::uuid AND active = true
      LIMIT 1
    `;
    if (!member) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return pipe;
  }

  return pipe;
}
