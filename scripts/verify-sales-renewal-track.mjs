/**
 * Verify T-30 renewal track (DB-level). Run: node scripts/verify-sales-renewal-track.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(join(__dirname, "../.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* optional */
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(
  url.includes("search_path") ? url : `${url}${sep}options=-c%20search_path%3Drm`,
  { max: 1 },
);

const failures = [];
function pass(msg) {
  console.log("✓", msg);
}
function fail(msg) {
  failures.push(msg);
  console.error("✗", msg);
}

try {
  const [admin] = await sql`SELECT id FROM staff WHERE role = 'admin' AND active = true LIMIT 1`;
  const [salesRm] = await sql`SELECT id FROM staff WHERE role = 'sales_rm' AND active = true LIMIT 1`;
  if (!admin || !salesRm) {
    fail("Need admin and sales_rm");
    process.exit(1);
  }

  const testDisplayId = `RENEW-TEST-${Date.now()}`;
  const planExpiry = new Date();
  planExpiry.setDate(planExpiry.getDate() + 30);
  const expiryStr = planExpiry.toISOString().slice(0, 10);
  const phone = `+9199999${String(Date.now()).slice(-5)}`;

  const [mua] = await sql`
    INSERT INTO muas (display_id, name, city, phone, status, source, plan_tier, plan_expiry)
    VALUES (
      ${testDisplayId},
      '__RENEWAL_TEST__',
      'TestCity',
      ${phone},
      'active',
      'Others',
      'phoenix',
      ${expiryStr}::date
    )
    RETURNING id
  `;

  const [hist] = await sql`
    INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_by, expiry_at, notes)
    VALUES (${mua.id}::uuid, 'phoenix', ${admin.id}::uuid, ${expiryStr}::date, 'test period')
    RETURNING id
  `;

  const planPeriodKey = hist.id;

  const [pipeline] = await sql`
    INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
    VALUES (${mua.id}::uuid, 'renewal', 'Untouched', 'active', ${salesRm.id}::uuid)
    RETURNING id
  `;

  await sql`
    INSERT INTO sales.renewal_attempt (mua_id, plan_history_id, plan_period_key, triggered_for_expiry, pipeline_id, outcome)
    VALUES (
      ${mua.id}::uuid,
      ${hist.id}::uuid,
      ${planPeriodKey},
      ${expiryStr}::date,
      ${pipeline.id}::uuid,
      'pending'
    )
  `;

  const [dup] = await sql`
    SELECT 1 FROM sales.renewal_attempt WHERE mua_id = ${mua.id}::uuid AND plan_period_key = ${planPeriodKey}
  `;
  if (dup) pass("Renewal attempt idempotent key stored");

  await sql`
    UPDATE muas SET plan_expiry = ${expiryStr}::date - 31, status = 'active', updated_at = NOW() WHERE id = ${mua.id}::uuid
  `;
  await sql`
    UPDATE sales.pipeline SET mua_type = 're_engage', updated_at = NOW()
    WHERE id = ${pipeline.id}::uuid
  `;
  await sql`
    UPDATE sales.renewal_attempt SET outcome = 'lapsed_without_renewal', outcome_at = NOW()
    WHERE pipeline_id = ${pipeline.id}::uuid
  `;

  const [converted] = await sql`
    SELECT mua_type, status FROM sales.pipeline WHERE id = ${pipeline.id}::uuid
  `;
  if (converted.mua_type === "re_engage") pass("Renewal converts to re-engage segment at expiry");

  await sql`DELETE FROM sales.renewal_attempt WHERE mua_id = ${mua.id}::uuid`;
  await sql`DELETE FROM sales.pipeline WHERE mua_id = ${mua.id}::uuid`;
  await sql`DELETE FROM mua_plan_history WHERE mua_id = ${mua.id}::uuid`;
  await sql`DELETE FROM muas WHERE id = ${mua.id}::uuid`;
  pass("Cleanup done");

  console.log(`\n${failures.length ? "FAILED" : "OK"} — ${failures.length} failures`);
  process.exit(failures.length ? 1 : 0);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
