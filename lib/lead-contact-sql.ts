import { COMM } from "@/lib/comm-types";

/** Correlated subquery sources for bride contact touches (calls + WhatsApp). */
export const LEAD_CONTACT_TOUCHES_UNION = `
  SELECT cl.id
  FROM call_logs cl
  WHERE cl.lead_id = bl.id
    AND cl.called_at IS NOT NULL

  UNION ALL

  SELECT c.id
  FROM comms c
  WHERE c.lead_id = bl.id
    AND c.entry_type = '${COMM.callyzerSynced}'

  UNION ALL

  SELECT c.id
  FROM comms c
  WHERE c.lead_id = bl.id
    AND c.entry_type = '${COMM.callLogged}'
    AND c.mua_id IS NULL

  UNION ALL

  SELECT c.id
  FROM comms c
  WHERE c.lead_id = bl.id
    AND c.entry_type = '${COMM.whatsappLogged}'
    AND c.mua_id IS NULL
`;

export const LEAD_LAST_CONTACT_UNION = `
  SELECT
    cl.called_at AS at,
    'call'::text AS channel,
    CASE WHEN cl.staff_id IS NOT NULL THEN 'callyzer' ELSE 'callyzer' END AS source
  FROM call_logs cl
  WHERE cl.lead_id = bl.id
    AND cl.called_at IS NOT NULL

  UNION ALL

  SELECT
    COALESCE(
      NULLIF(c.metadata->>'calledAt', '')::timestamptz,
      c.created_at
    ) AS at,
    'call'::text AS channel,
    'callyzer'::text AS source
  FROM comms c
  WHERE c.lead_id = bl.id
    AND c.entry_type = '${COMM.callyzerSynced}'

  UNION ALL

  SELECT
    c.created_at AS at,
    'call'::text AS channel,
    'manual'::text AS source
  FROM comms c
  WHERE c.lead_id = bl.id
    AND c.entry_type = '${COMM.callLogged}'
    AND c.mua_id IS NULL

  UNION ALL

  SELECT
    c.created_at AS at,
    'whatsapp'::text AS channel,
    'whatsapp'::text AS source
  FROM comms c
  WHERE c.lead_id = bl.id
    AND c.entry_type = '${COMM.whatsappLogged}'
    AND c.mua_id IS NULL
`;
