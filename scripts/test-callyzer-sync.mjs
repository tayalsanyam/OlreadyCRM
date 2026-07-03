/**
 * End-to-end Callyzer sync + phone matching test.
 * Usage: node --env-file=.env.local scripts/test-callyzer-sync.mjs [staffId]
 */
import { readFileSync } from "fs";
import postgres from "postgres";
import { runCallyzerSyncForStaff } from "../lib/callyzer-sync.ts";
import { getCallyzerStaffSyncStatus } from "../lib/callyzer-staff-status.ts";
import { normalizePhone } from "../lib/phone.ts";

const url = process.env.DATABASE_URL;
const sep = url.includes("?") ? "&" : "?";
const sql = postgres(
  url.includes("search_path") ? url : `${url}${sep}options=-c%20search_path%3Drm`,
);

function phoneTailMatch(client) {
  const tail = normalizePhone(client);
  if (tail.length < 10) return null;
  return "%" + tail;
}

async function ensureMigration() {
  const [t] = await sql`SELECT to_regclass('rm.callyzer_sync_state') AS tbl`;
  if (t?.tbl) return;
  const batch = readFileSync("db/migrations/084_callyzer_sync_state.sql", "utf8");
  await sql.unsafe(batch);
  console.log("Applied migration 084_callyzer_sync_state");
}

async function pickStaffId() {
  const arg = process.argv[2];
  if (arg) return arg;
  const [row] = await sql`
    SELECT id, name, callyzer_number
    FROM staff
    WHERE active = true
      AND callyzer_number IS NOT NULL
      AND length(regexp_replace(callyzer_number, '\\D', '', 'g')) >= 10
    ORDER BY name
    LIMIT 1
  `;
  if (!row) throw new Error("No staff with Callyzer number");
  console.log("Staff:", row.name, "|", row.callyzer_number, "|", row.id);
  return row.id;
}

async function fetchCallyzerSample(empNumber) {
  const token = process.env.CALLYZER_API_TOKEN;
  if (!token) throw new Error("Missing CALLYZER_API_TOKEN");

  const toTs = Math.floor(Date.now() / 1000);
  const fromTs = toTs - 24 * 60 * 60;
  const base = process.env.CALLYZER_API_BASE_URL ?? "https://api1.callyzer.co/api/v2.1";
  const res = await fetch(`${base.replace(/\/$/, "")}/call-log/history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      synced_from: fromTs,
      synced_to: toTs,
      call_types: ["Incoming", "Outgoing"],
      emp_numbers: [normalizePhone(empNumber)],
      is_exclude_numbers: false,
      page_no: 1,
      page_size: 5,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Callyzer API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const payload = await res.json();
  return payload.result ?? [];
}

async function testPhoneMatching(callyzerRows) {
  console.log("\n=== Phone format comparison (Callyzer vs MUA storage) ===\n");

  const samples = callyzerRows.slice(0, 5);
  if (samples.length === 0) {
    console.log("No calls in last 24h — skipping live format comparison");
    return;
  }

  for (const row of samples) {
    const raw = row.client_number ?? "";
    const normalized = normalizePhone(raw);
    const tail = phoneTailMatch(raw);

    const [mua] = await sql`
      SELECT id, name, phone, whatsapp
      FROM muas
      WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE ${tail}
         OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') LIKE ${tail}
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    console.log({
      callyzer_client_number: raw,
      normalized_10_digit: normalized,
      sql_tail_pattern: tail,
      mua_matched: mua
        ? { id: mua.id, name: mua.name, phone: mua.phone, whatsapp: mua.whatsapp }
        : null,
    });
  }

  // Show how stored MUA phones compare when normalized
  const muaSamples = await sql`
    SELECT phone, whatsapp
    FROM muas
    WHERE phone IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 3
  `;
  console.log("\nMUA stored vs normalized:");
  for (const m of muaSamples) {
    console.log({
      stored_phone: m.phone,
      stored_whatsapp: m.whatsapp,
      normalized_phone: m.phone ? normalizePhone(m.phone) : null,
      normalized_whatsapp: m.whatsapp ? normalizePhone(m.whatsapp) : null,
    });
  }
}

async function runSyncPass(label, staffId) {
  console.log(`\n=== ${label} ===`);
  const before = await getCallyzerStaffSyncStatus(staffId);
  console.log("Status before:", JSON.stringify(before, null, 2));

  const [callsBefore] = await sql`
    SELECT COUNT(*)::int AS n FROM call_logs cl
    JOIN staff s ON s.id = cl.staff_id
    WHERE s.id = ${staffId}::uuid
  `;

  const result = await runCallyzerSyncForStaff(staffId);
  console.log("Sync result:", JSON.stringify(result, null, 2));

  const after = await getCallyzerStaffSyncStatus(staffId);
  console.log("Status after:", JSON.stringify(after, null, 2));

  const [callsAfter] = await sql`
    SELECT COUNT(*)::int AS n FROM call_logs cl
    JOIN staff s ON s.id = cl.staff_id
    WHERE s.id = ${staffId}::uuid
  `;

  const latest = await sql`
    SELECT callyzer_call_id, client_phone, contact_type, mua_id, lead_id, called_at
    FROM call_logs
    WHERE staff_id = ${staffId}::uuid
    ORDER BY created_at DESC
    LIMIT 3
  `;

  console.log("Call logs:", { before: callsBefore?.n, after: callsAfter?.n, added: (callsAfter?.n ?? 0) - (callsBefore?.n ?? 0) });
  console.log("Latest ingested:", JSON.stringify(latest, null, 2));

  return result;
}

async function main() {
  await ensureMigration();
  const staffId = await pickStaffId();

  const [staff] = await sql`
    SELECT callyzer_number FROM staff WHERE id = ${staffId}::uuid
  `;

  const apiRows = await fetchCallyzerSample(staff.callyzer_number);
  console.log(`\nCallyzer API returned ${apiRows.length} sample call(s) (last 24h)`);
  if (apiRows[0]) {
    console.log("Sample API row keys:", Object.keys(apiRows[0]).join(", "));
    console.log("Sample row:", JSON.stringify(apiRows[0], null, 2));
  }

  await testPhoneMatching(apiRows);

  // Login sync (first pull)
  const first = await runSyncPass("Login sync (first pull)", staffId);

  // Refresh sync (immediate second pull — should skip duplicates / already up to date)
  const second = await runSyncPass("Refresh sync (second pull)", staffId);

  console.log("\n=== Summary ===");
  console.log({
    firstPull: { inserted: first.inserted, skipped: first.skipped, synced: first.synced, message: first.message },
    refreshPull: { inserted: second.inserted, skipped: second.skipped, synced: second.synced, message: second.message },
    phoneMatchWorks: apiRows.length
      ? "See mua_matched above — tail match on last 10 digits"
      : "No live calls to verify",
  });

  await sql.end();
}

main().catch(async (err) => {
  console.error("TEST_FAILED", err instanceof Error ? err.message : err);
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
