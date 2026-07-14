import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export type CareMuaLookupRow = {
  id: string;
  displayId: string;
  name: string;
  phone: string | null;
  city: string | null;
  planTier: string | null;
  openTickets: number;
};

export async function searchCareMuas(
  tx: TransactionSql,
  query: string,
  limit = 50
): Promise<CareMuaLookupRow[]> {
  const q = query.trim();
  if (!q) {
    return tx<CareMuaLookupRow[]>`
      SELECT
        m.id,
        m.display_id AS "displayId",
        m.name,
        m.phone,
        m.city,
        m.plan_tier::text AS "planTier",
        COALESCE(t.open_count, 0)::int AS "openTickets"
      FROM muas m
      LEFT JOIN (
        SELECT mua_id, COUNT(*)::int AS open_count
        FROM support.tickets
        WHERE status <> 'closed' AND mua_id IS NOT NULL
        GROUP BY mua_id
      ) t ON t.mua_id = m.id
      WHERE m.status <> 'junk'
      ORDER BY m.name
      LIMIT ${limit}
    `;
  }

  const phone = normalizePhone(q);
  const like = `%${q.replace(/%/g, "")}%`;

  return tx<CareMuaLookupRow[]>`
    SELECT
      m.id,
      m.display_id AS "displayId",
      m.name,
      m.phone,
      m.city,
      m.plan_tier::text AS "planTier",
      COALESCE(t.open_count, 0)::int AS "openTickets"
    FROM muas m
    LEFT JOIN (
      SELECT mua_id, COUNT(*)::int AS open_count
      FROM support.tickets
      WHERE status <> 'closed' AND mua_id IS NOT NULL
      GROUP BY mua_id
    ) t ON t.mua_id = m.id
    WHERE m.status <> 'junk'
      AND (
        m.name ILIKE ${like}
        OR m.city ILIKE ${like}
        OR m.display_id ILIKE ${like}
        OR LOWER(COALESCE(m.email, '')) ILIKE ${like}
        OR (${phone.length >= 10} AND RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${phone})
        OR (${phone.length >= 10} AND RIGHT(REGEXP_REPLACE(COALESCE(m.alternate_phone, ''), '\\D', '', 'g'), 10) = ${phone})
      )
    ORDER BY m.name
    LIMIT ${limit}
  `;
}
