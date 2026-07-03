#!/usr/bin/env node
/**
 * Fix legacy push rows from pre–multi-booking behaviour.
 * npm run db:repair-pushes
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([^#=]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const dbUrl = `${url}${sep}options=-c%20search_path%3Drm`;

const postgres = (await import("postgres")).default;
const sql = postgres(dbUrl, {
  transform: postgres.camel,
  ssl: dbUrl.includes("supabase.co") ? "require" : false,
  max: 1,
});

try {
  const bookedFixed = await sql`
    UPDATE mua_pushes mp SET status = 'active', updated_at = NOW()
    WHERE mp.status = 'booked'
      AND EXISTS (
        SELECT 1
        FROM unnest(mp.event_ids) AS eid(id)
        JOIN lead_events le ON le.id = eid.id
        WHERE le.status NOT IN ('booked', 'not_needed')
      )
    RETURNING id
  `;

  const awaitingFixed = await sql`
    UPDATE mua_pushes mp SET status = 'active', updated_at = NOW()
    WHERE mp.status = 'awaiting_close'
      AND EXISTS (
        SELECT 1 FROM lead_events le
        WHERE le.lead_id = mp.lead_id AND le.status = 'open'
      )
    RETURNING id
  `;

  const tasksCancelled = await sql`
    UPDATE rm_tasks SET status = 'cancelled', updated_at = NOW()
    WHERE task_type = 'close_conversation'
      AND status = 'pending'
      AND push_id IN (
        SELECT id FROM mua_pushes WHERE status = 'active'
      )
    RETURNING id
  `;

  console.log(`Reactivated ${bookedFixed.length} push(es) incorrectly marked booked`);
  console.log(`Reactivated ${awaitingFixed.length} push(es) stuck in awaiting_close`);
  console.log(`Cancelled ${tasksCancelled.length} orphan close_conversation task(s)`);
} finally {
  await sql.end({ timeout: 3 });
}
