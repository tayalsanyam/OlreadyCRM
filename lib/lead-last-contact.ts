import type { TransactionSql } from "@/db/index";
import { COMM } from "@/lib/comm-types";

export type LastLeadContact = {
  at: string;
  direction: "inbound" | "outbound" | null;
  durationSec: number | null;
  actorName: string | null;
  source: "callyzer" | "manual" | "whatsapp";
  channel: "call" | "whatsapp";
};

/** Latest bride contact from Callyzer, manual call log, or WhatsApp on the lead. */
export async function getLastLeadContact(
  tx: TransactionSql,
  leadId: string,
): Promise<LastLeadContact | null> {
  const [row] = await tx<
    {
      at: string;
      direction: string | null;
      durationSec: number | null;
      actorName: string | null;
      source: string;
      channel: string;
    }[]
  >`
    SELECT at, direction, "durationSec", "actorName", source, channel FROM (
      SELECT
        cl.called_at AS at,
        cl.direction,
        cl.duration_sec AS "durationSec",
        s.name AS "actorName",
        'callyzer'::text AS source,
        'call'::text AS channel
      FROM call_logs cl
      LEFT JOIN staff s ON s.id = cl.staff_id
      WHERE cl.lead_id = ${leadId}::uuid
        AND cl.called_at IS NOT NULL

      UNION ALL

      SELECT
        COALESCE(
          NULLIF(c.metadata->>'calledAt', '')::timestamptz,
          c.created_at
        ) AS at,
        CASE
          WHEN c.metadata->>'direction' IN ('inbound', 'outbound')
            THEN c.metadata->>'direction'
          ELSE NULL
        END AS direction,
        NULLIF((c.metadata->>'durationSec')::int, 0) AS "durationSec",
        s.name AS "actorName",
        'callyzer'::text AS source,
        'call'::text AS channel
      FROM comms c
      LEFT JOIN staff s ON s.id = c.actor_id
      WHERE c.lead_id = ${leadId}::uuid
        AND c.entry_type = ${COMM.callyzerSynced}

      UNION ALL

      SELECT
        c.created_at AS at,
        NULL::text AS direction,
        NULL::int AS "durationSec",
        s.name AS "actorName",
        'manual'::text AS source,
        'call'::text AS channel
      FROM comms c
      LEFT JOIN staff s ON s.id = c.actor_id
      WHERE c.lead_id = ${leadId}::uuid
        AND c.entry_type = ${COMM.callLogged}
        AND c.mua_id IS NULL

      UNION ALL

      SELECT
        c.created_at AS at,
        NULL::text AS direction,
        NULL::int AS "durationSec",
        s.name AS "actorName",
        'whatsapp'::text AS source,
        'whatsapp'::text AS channel
      FROM comms c
      LEFT JOIN staff s ON s.id = c.actor_id
      WHERE c.lead_id = ${leadId}::uuid
        AND c.entry_type = ${COMM.whatsappLogged}
        AND c.mua_id IS NULL
    ) combined
    WHERE at IS NOT NULL
    ORDER BY at DESC
    LIMIT 1
  `;

  if (!row) return null;
  return {
    at: row.at,
    direction:
      row.direction === "inbound" || row.direction === "outbound" ? row.direction : null,
    durationSec: row.durationSec,
    actorName: row.actorName,
    source:
      row.source === "callyzer"
        ? "callyzer"
        : row.source === "whatsapp"
          ? "whatsapp"
          : "manual",
    channel: row.channel === "whatsapp" ? "whatsapp" : "call",
  };
}

export function formatLastLeadContactSource(contact: LastLeadContact): string {
  if (contact.channel === "whatsapp") return "WhatsApp";
  if (contact.source === "callyzer") return "Callyzer call";
  return "Manual call";
}
