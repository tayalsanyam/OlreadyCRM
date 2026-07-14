import type { TransactionSql } from "@/db/index";
import type { MuaType } from "@/lib/types";

/** Renewal (on plan) > re_engage (plan history) > candidate (potential). */
export async function salesPipelineSegment(
  tx: TransactionSql,
  muaId: string
): Promise<MuaType> {
  const [row] = await tx<{ hasHistory: boolean; onActivePlan: boolean }[]>`
    SELECT
      EXISTS (
        SELECT 1 FROM mua_plan_history WHERE mua_id = ${muaId}::uuid
      ) AS "hasHistory",
      EXISTS (
        SELECT 1 FROM muas m
        WHERE m.id = ${muaId}::uuid
          AND m.plan_tier IS NOT NULL
          AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
      ) AS "onActivePlan"
  `;
  if (row?.onActivePlan) return "renewal";
  return row?.hasHistory ? "re_engage" : "candidate";
}

export async function muaHasActiveSalesPipeline(
  tx: TransactionSql,
  muaId: string
): Promise<boolean> {
  const [row] = await tx<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM sales.pipeline p
      WHERE p.mua_id = ${muaId}::uuid
        AND p.status = 'active'
    ) AS ok
  `;
  return row?.ok ?? false;
}

export async function muaHasRejectedSalesPipeline(
  tx: TransactionSql,
  muaId: string,
): Promise<boolean> {
  const [row] = await tx<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM sales.pipeline p
      WHERE p.mua_id = ${muaId}::uuid
        AND p.status = 'active'
        AND p.stage = 'Rejected'
    ) AS ok
  `;
  return row?.ok ?? false;
}

/**
 * Create an unassigned sales pipeline for a MUA (upload / add / inactive roster).
 * Segment is derived from plan history, not roster status. Inactive MUAs get a
 * pipeline but remain unassigned until roster is active and a Sales RM is set.
 */
export async function createUnassignedSalesPipeline(
  tx: TransactionSql,
  opts: {
    muaId: string;
    actorId?: string | null;
    muaName?: string;
  }
): Promise<{ pipelineId: string; muaType: MuaType } | null> {
  const [mua] = await tx<{ id: string; name: string; status: string }[]>`
    SELECT id, name, status::text AS status FROM muas WHERE id = ${opts.muaId}::uuid
  `;
  if (!mua) return null;

  if (await muaHasActiveSalesPipeline(tx, opts.muaId)) return null;

  const muaType = await salesPipelineSegment(tx, opts.muaId);
  const [pipeline] = await tx<{ id: string }[]>`
    INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
    VALUES (${opts.muaId}::uuid, ${muaType}, 'Untouched', 'active', NULL)
    RETURNING id
  `;
  if (!pipeline) return null;

  if (opts.actorId) {
    const label =
      muaType === "renewal"
        ? "Renewal"
        : muaType === "candidate"
          ? "Potential"
          : "Existing No Plan";
    await tx`
      INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
      VALUES (
        ${pipeline.id}::uuid,
        'stageChanged',
        ${`Unassigned ${label} pipeline created`},
        ${opts.actorId}::uuid,
        ${tx.json({ bootstrap: true, muaType })}
      )
    `;
  }

  return { pipelineId: pipeline.id, muaType };
}
