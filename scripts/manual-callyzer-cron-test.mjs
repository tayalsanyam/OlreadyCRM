/**
 * Manual test for per-staff Callyzer sync.
 * Usage: node --env-file=.env.local scripts/manual-callyzer-cron-test.mjs [staffId]
 */
import { runCallyzerSyncForStaff } from "../lib/callyzer-sync.ts";
import { getCallyzerStaffSyncStatus } from "../lib/callyzer-staff-status.ts";
import { sql } from "../db/index.ts";

async function pickStaffId() {
  const arg = process.argv[2];
  if (arg) return arg;

  const [row] = await sql<{ id: string; name: string }[]>`
    SELECT id, name
    FROM staff
    WHERE active = true
      AND callyzer_number IS NOT NULL
      AND length(regexp_replace(callyzer_number, '\\D', '', 'g')) >= 10
    ORDER BY name
    LIMIT 1
  `;
  if (!row) throw new Error("No staff with Callyzer number found");
  console.log("Using staff:", row.name, row.id);
  return row.id;
}

async function main() {
  const staffId = await pickStaffId();
  const before = await getCallyzerStaffSyncStatus(staffId);
  console.log("STATUS_BEFORE", JSON.stringify(before, null, 2));

  console.log("\n--- runCallyzerSyncForStaff ---");
  const sync = await runCallyzerSyncForStaff(staffId);
  console.log("SYNC_RESULT", JSON.stringify(sync, null, 2));

  const after = await getCallyzerStaffSyncStatus(staffId);
  console.log("STATUS_AFTER", JSON.stringify(after, null, 2));

  const [inserted] = await sql`
    SELECT COUNT(*)::int AS n FROM call_logs WHERE created_at >= NOW() - INTERVAL '5 minutes'
  `;
  console.log("CALL_LOGS_INSERTED_LAST_5MIN", inserted?.n);

  await sql.end();
}

main().catch((err) => {
  console.error("CALLYZER_SYNC_TEST_FAILED", err instanceof Error ? err.message : err);
  process.exit(1);
});
