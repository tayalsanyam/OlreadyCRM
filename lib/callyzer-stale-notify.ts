import type { TransactionSql } from "@/db/index";
import { createNotification } from "@/lib/notifications";

/** Notify admins when staff with Callyzer mapping have stale call data (deduped per day). */
export async function notifyCallyzerStaleUsers(tx: TransactionSql): Promise<{
  staleUsers: number;
  notificationsCreated: number;
}> {
  const staleUsers = await tx<{ id: string; name: string; lastCallAt: string | null }[]>`
    SELECT
      s.id,
      s.name,
      MAX(cl.called_at) AS "lastCallAt"
    FROM staff s
    LEFT JOIN call_logs cl ON cl.staff_id = s.id
    WHERE s.active = true
      AND COALESCE(s.callyzer_number, '') <> ''
      AND length(regexp_replace(s.callyzer_number, '\D', '', 'g')) >= 10
    GROUP BY s.id, s.name
    HAVING MAX(cl.called_at) IS NULL OR MAX(cl.called_at) < NOW() - INTERVAL '3 day'
    ORDER BY s.name
  `;

  const admins = await tx<{ id: string }[]>`
    SELECT id
    FROM staff
    WHERE active = true
      AND role::text IN ('admin', 'owner')
  `;

  let notificationsCreated = 0;
  for (const user of staleUsers) {
    const token = `[CALLYZER_STALE:${user.id}]`;
    const days = user.lastCallAt
      ? Math.floor((Date.now() - new Date(user.lastCallAt).getTime()) / 86400000)
      : null;
    const message =
      days === null
        ? `${token} ${user.name} has no Callyzer call data yet.`
        : `${token} ${user.name} has no Callyzer call data for ${days} days.`;

    for (const admin of admins) {
      const [exists] = await tx<{ id: string }[]>`
        SELECT id
        FROM notifications
        WHERE staff_id = ${admin.id}::uuid
          AND message LIKE ${`%${token}%`}
          AND created_at::date = CURRENT_DATE
        LIMIT 1
      `;
      if (exists) continue;

      await createNotification(tx, {
        userId: admin.id,
        message,
        link: "/admin/reports",
      });
      notificationsCreated++;
    }
  }

  return { staleUsers: staleUsers.length, notificationsCreated };
}
