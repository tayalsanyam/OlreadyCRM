/**
 * End-to-end verification of sales rejected / junk / re-churn loop (DB-level).
 * Run: node scripts/verify-sales-pipeline-loop.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log("✓", msg);
}
function fail(msg) {
  failures.push(msg);
  console.error("✗", msg);
}

try {
  const [admin] = await sql`
    SELECT id, name FROM staff WHERE role = 'admin' AND active = true LIMIT 1
  `;
  const [salesRm] = await sql`
    SELECT id, name FROM staff WHERE role = 'sales_rm' AND active = true LIMIT 1
  `;
  if (!admin || !salesRm) {
    fail("Need at least one active admin and sales_rm in DB");
    process.exit(1);
  }

  // Create ephemeral test MUA + pipeline
  const testDisplayId = `LOOP-TEST-${Date.now()}`;
  const [mua] = await sql`
    INSERT INTO muas (display_id, name, city, phone, status, source)
    VALUES (${testDisplayId}, '__LOOP_TEST_MUA__', 'TestCity', ${`+9199999${String(Date.now()).slice(-5)}`}, 'candidate', 'Others')
    RETURNING id
  `;
  const [pipe] = await sql`
    INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
    VALUES (${mua.id}::uuid, 'candidate', 'Untouched', 'active', ${salesRm.id}::uuid)
    RETURNING id
  `;
  const pipelineId = pipe.id;

  // 1) Reject
  await sql`
    UPDATE sales.pipeline
    SET stage = 'Rejected', rejection_reason = 'Not interested', rejection_note = 'Test rejection note',
        rejected_at = NOW(), rejected_by = ${salesRm.id}::uuid, updated_at = NOW()
    WHERE id = ${pipelineId}::uuid
  `;
  const [rejected] = await sql`
    SELECT stage, status, rejection_reason FROM sales.pipeline WHERE id = ${pipelineId}::uuid
  `;
  if (rejected.stage === "Rejected" && rejected.rejection_reason === "Not interested") {
    pass("Reject sets stage + rejection metadata");
  } else fail("Reject metadata missing");

  // 2) Rejected appears in list query (active + Rejected)
  const [inRejectedList] = await sql`
    SELECT 1 FROM sales.pipeline WHERE id = ${pipelineId}::uuid AND status = 'active' AND stage = 'Rejected'
  `;
  if (inRejectedList) pass("Rejected pipeline in rejected queue query");
  else fail("Rejected pipeline not found in queue");

  // 3) Hidden from default pipeline list (stage <> Rejected)
  const [inDefaultList] = await sql`
    SELECT 1 FROM sales.pipeline WHERE id = ${pipelineId}::uuid AND status = 'active' AND stage <> 'Rejected'
  `;
  if (!inDefaultList) pass("Rejected hidden from default pipeline list");
  else fail("Rejected still in default pipeline list");

  // 4) Re-assign (reset to Untouched)
  await sql`
    UPDATE sales.pipeline
    SET assigned_to = ${salesRm.id}::uuid, stage = 'Untouched',
        rejection_reason = NULL, rejection_note = NULL, rejected_at = NULL, rejected_by = NULL,
        updated_at = NOW()
    WHERE id = ${pipelineId}::uuid AND status = 'active' AND stage = 'Rejected'
  `;
  const [reopened] = await sql`
    SELECT stage, rejection_reason FROM sales.pipeline WHERE id = ${pipelineId}::uuid
  `;
  if (reopened.stage === "Untouched" && !reopened.rejection_reason) {
    pass("Re-assign clears rejection and resets to Untouched");
  } else fail("Re-assign did not reset pipeline");

  // 5) Reject again then junk
  await sql`
    UPDATE sales.pipeline
    SET stage = 'Rejected', rejection_reason = 'Duplicate', rejected_at = NOW(),
        rejected_by = ${admin.id}::uuid, updated_at = NOW()
    WHERE id = ${pipelineId}::uuid
  `;
  await sql`
    UPDATE sales.pipeline SET status = 'junked', updated_at = NOW()
    WHERE id = ${pipelineId}::uuid AND stage = 'Rejected' AND status = 'active'
  `;
  await sql`
    INSERT INTO sales.pipeline_junk (
      pipeline_id, mua_id, mua_type, mua_name, mua_city, mua_source, mua_phone,
      assigned_to_id, assigned_to_name, rejection_reason, junk_reason, junked_by
    )
    SELECT
      p.id, p.mua_id, p.mua_type, m.name, m.city, m.source, m.phone,
      p.assigned_to, s.name, p.rejection_reason, 'Loop test junk', ${admin.id}::uuid
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff s ON s.id = p.assigned_to
    WHERE p.id = ${pipelineId}::uuid
  `;

  const [junked] = await sql`
    SELECT status FROM sales.pipeline WHERE id = ${pipelineId}::uuid
  `;
  const [junkRow] = await sql`
    SELECT id FROM sales.pipeline_junk WHERE pipeline_id = ${pipelineId}::uuid
  `;
  if (junked.status === "junked" && junkRow) pass("Junk archives pipeline and sets status=junked");
  else fail("Junk archive incomplete");

  const [activeAfterJunk] = await sql`
    SELECT 1 FROM sales.pipeline WHERE mua_id = ${mua.id}::uuid AND status = 'active'
  `;
  if (!activeAfterJunk) pass("No active pipeline after junk (MUA stays, pipeline archived)");
  else fail("Active pipeline still exists after junk");

  // 6) Re-engage creates new active pipeline (nothing leaves except junk)
  const [newPipe] = await sql`
    INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
    VALUES (${mua.id}::uuid, 're_engage', 'Untouched', 'active', ${salesRm.id}::uuid)
    RETURNING id
  `;
  if (newPipe?.id) pass("Re-engage can create new active pipeline after junk");
  else fail("Re-engage pipeline creation failed");

  // Cleanup
  await sql`DELETE FROM sales.pipeline_junk WHERE pipeline_id = ${pipelineId}::uuid`;
  await sql`DELETE FROM sales.pipeline WHERE mua_id = ${mua.id}::uuid`;
  await sql`DELETE FROM muas WHERE id = ${mua.id}::uuid`;
  pass("Test data cleaned up");

  console.log(`\n${passes.length} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
