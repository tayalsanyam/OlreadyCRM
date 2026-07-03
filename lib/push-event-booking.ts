import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { closePushAndClearTasks } from "@/lib/stage-tasks";

/** Open ceremonies still on this push (not booked / not_needed). */
async function countOpenEventsOnPush(
  tx: TransactionSql,
  pushId: string
): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM mua_pushes mp
    CROSS JOIN unnest(mp.event_ids) AS eid(id)
    JOIN lead_events le ON le.id = eid.id
    WHERE mp.id = ${pushId}::uuid
      AND le.status NOT IN ('booked', 'not_needed')
  `;
  return row?.n ?? 0;
}

/**
 * After a single ceremony is booked, sync push rows so sibling ceremonies stay workable.
 * - Winning push: `booked` only when every ceremony on that push is booked.
 * - Other pushes: remove the booked ceremony; close only if it was their last one.
 */
export async function syncPushesAfterEventBooked(
  tx: TransactionSql,
  params: {
    leadId: string;
    eventId: string;
    winningPushId: string;
    ceremonyLabel: string;
    actorId: string;
    assignedRmId: string | null;
    brideName: string;
  }
): Promise<void> {
  const openOnWinner = await countOpenEventsOnPush(tx, params.winningPushId);
  if (openOnWinner === 0) {
    await tx`
      UPDATE mua_pushes SET status = 'booked', updated_at = NOW()
      WHERE id = ${params.winningPushId}::uuid
    `;
  } else {
    await tx`
      UPDATE mua_pushes SET status = 'active', updated_at = NOW()
      WHERE id = ${params.winningPushId}::uuid
        AND status IN ('booked', 'awaiting_close')
    `;
  }

  const competitors = await tx<
    { id: string; muaId: string; eventIds: string[] }[]
  >`
    SELECT id, mua_id AS "muaId", event_ids AS "eventIds"
    FROM mua_pushes
    WHERE lead_id = ${params.leadId}::uuid
      AND id != ${params.winningPushId}::uuid
      AND status IN ('active', 'awaiting_close')
      AND ${params.eventId}::uuid = ANY(event_ids)
  `;

  for (const row of competitors) {
    const remaining = row.eventIds.filter((eid: string) => eid !== params.eventId);
    const [mua] = await tx<{ name: string }[]>`
      SELECT name FROM muas WHERE id = ${row.muaId}::uuid
    `;
    const muaName = mua?.name ?? "MUA";

    if (remaining.length === 0) {
      await tx`
        UPDATE mua_pushes SET
          status = 'closed',
          outcome = 'not_selected'::push_outcome,
          event_ids = '{}'::uuid[],
          closed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${row.id}::uuid
      `;
      await closePushAndClearTasks(tx, row.id);
      await appendComm(tx, {
        leadId: params.leadId,
        muaId: row.muaId,
        entryType: COMM.conversationClosed,
        description: `Not selected for ${params.ceremonyLabel} — ${muaName}`,
        actorId: params.actorId,
        metadata: { pushId: row.id, eventId: params.eventId },
      });
      continue;
    }

    await tx`
      UPDATE mua_pushes SET
        event_ids = ${remaining}::uuid[],
        status = 'active',
        updated_at = NOW()
      WHERE id = ${row.id}::uuid
    `;
    await tx`
      UPDATE rm_tasks SET status = 'cancelled', updated_at = NOW()
      WHERE push_id = ${row.id}::uuid
        AND task_type = 'close_conversation'
        AND status = 'pending'
    `;
    await appendComm(tx, {
      leadId: params.leadId,
      muaId: row.muaId,
      entryType: COMM.note,
      description: `${params.ceremonyLabel} booked with another MUA — ${muaName} continues for other ceremonies`,
      actorId: params.actorId,
      metadata: { pushId: row.id, eventId: params.eventId },
    });
  }
}

/** Re-sync winning push status after a booking is cancelled. */
export async function syncWinningPushAfterEventUnbooked(
  tx: TransactionSql,
  pushId: string | null
): Promise<void> {
  if (!pushId) return;
  const open = await countOpenEventsOnPush(tx, pushId);
  if (open > 0) {
    await tx`
      UPDATE mua_pushes SET status = 'active', updated_at = NOW()
      WHERE id = ${pushId}::uuid AND status = 'booked'
    `;
  }
}
