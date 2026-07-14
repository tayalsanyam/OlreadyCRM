import type { TransactionSql } from "@/db/index";
import { COMM } from "@/lib/comm-types";

async function resolveLeadIdForMua(tx: TransactionSql, muaId: string): Promise<string | null> {
  const [row] = await tx<{ leadId: string }[]>`
    SELECT bl.id AS "leadId"
    FROM bride_leads bl
    JOIN lead_events le ON le.lead_id = bl.id
    WHERE le.mua_id = ${muaId}::uuid
    ORDER BY bl.updated_at DESC
    LIMIT 1
  `;
  return row?.leadId ?? null;
}

export async function appendSalesEventToRmComms(
  tx: TransactionSql,
  params: {
    muaId: string | null;
    actorId: string;
    description: string;
    metadata?: Record<string, unknown>;
    entryType?: string;
  }
): Promise<void> {
  if (!params.muaId) return;
  const leadId = await resolveLeadIdForMua(tx, params.muaId);
  if (!leadId) return;

  const entryType = params.entryType ?? COMM.note;
  await tx`
    INSERT INTO comms (lead_id, mua_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${leadId}::uuid,
      ${params.muaId}::uuid,
      ${entryType}::comm_entry_type,
      ${params.description},
      ${params.actorId}::uuid,
      ${tx.json(params.metadata ?? {})}
    )
  `;
}
