#!/usr/bin/env node
/**
 * Smoke test: GET/POST /api/admin/users/[id]/migrate
 * Usage: node scripts/smoke-staff-migrate.mjs [baseUrl]
 */
import { SMOKE_USERS, SMOKE_PASSWORD, loadSmokeEnv } from "./smoke-env.mjs";
import postgres from "postgres";

loadSmokeEnv();

const base = process.argv[2] ?? "http://localhost:3000";

let failed = 0;
let passed = 0;

function pass(msg) {
  passed++;
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  failed++;
  console.log(`✗ ${msg}`);
}

async function login(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
  });
  const json = await res.json();
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok || json.error || !cookie) throw new Error(json.error ?? `login ${res.status}`);
  return cookie;
}

async function api(method, path, cookie, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function dbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const sep = url.includes("?") ? "&" : "?";
  return url.includes("search_path")
    ? url
    : `${url}${sep}options=-c%20search_path%3Drm`;
}

console.log(`Staff migrate smoke @ ${base}\n`);

let cookie;
try {
  cookie = await login(SMOKE_USERS.admin);
  pass("admin login");
} catch (e) {
  fail(`admin login: ${e.message}`);
  process.exit(1);
}

const { res: usersRes, json: usersJson } = await api("GET", "/api/admin/users", cookie);
if (!usersRes.ok || !Array.isArray(usersJson.data)) {
  fail(`GET /api/admin/users → ${usersRes.status}`);
  process.exit(1);
}
pass("GET /api/admin/users");

const adminUser = usersJson.data.find((u) => u.role === "admin");
let regionalRms = usersJson.data.filter((u) => u.role === "regionalRm" && u.active);
let salesRm = usersJson.data.find((u) => u.role === "salesRm" && u.active);

const db = dbUrl();
const sql = db ? postgres(db, { max: 1 }) : null;
const reactivateAfter = [];

async function ensureActive(users, roleFilter) {
  if (!sql) return users;
  const out = [];
  for (const u of users) {
    if (u.active) {
      out.push(u);
      continue;
    }
    await sql`
      UPDATE staff SET active = true, updated_at = NOW() WHERE id = ${u.id}::uuid
    `;
    reactivateAfter.push({ id: u.id, wasActive: false });
    out.push({ ...u, active: true });
  }
  if (!out.length && roleFilter) {
    const inactive = usersJson.data.filter(roleFilter);
    for (const u of inactive.slice(0, 2)) {
      await sql`
        UPDATE staff SET active = true, updated_at = NOW() WHERE id = ${u.id}::uuid
      `;
      reactivateAfter.push({ id: u.id, wasActive: false });
      out.push({ ...u, active: true });
    }
  }
  return out;
}

if (sql) {
  regionalRms = await ensureActive(regionalRms, (u) => u.role === "regionalRm");
  if (!salesRm) {
    const inactiveSales = usersJson.data.filter((u) => u.role === "salesRm");
    if (inactiveSales[0]) {
      await sql`
        UPDATE staff SET active = true, updated_at = NOW() WHERE id = ${inactiveSales[0].id}::uuid
      `;
      reactivateAfter.push({ id: inactiveSales[0].id, wasActive: false });
      salesRm = { ...inactiveSales[0], active: true };
    }
  }
}

if (adminUser) {
  const { res, json } = await api("GET", `/api/admin/users/${adminUser.id}/migrate`, cookie);
  if (res.ok && json.data?.migratable === false) {
    pass("GET migrate admin → migratable false");
  } else {
    fail(`GET migrate admin expected migratable false, got ${res.status} ${JSON.stringify(json)}`);
  }
}

if (regionalRms.length >= 1) {
  const from = regionalRms[0];
  const { res, json } = await api("GET", `/api/admin/users/${from.id}/migrate`, cookie);
  if (res.ok && json.data?.migratable === true && Array.isArray(json.data.eligible)) {
    pass(`GET migrate regional RM (${from.name}) → preview + eligible`);
  } else {
    fail(`GET migrate regional RM: ${res.status} ${JSON.stringify(json.error ?? json)}`);
  }

  const to = regionalRms.find((u) => u.id !== from.id);
  if (to) {
    const { res, json } = await api(
      "GET",
      `/api/admin/users/${from.id}/migrate?toStaffId=${to.id}`,
      cookie,
    );
    if (res.ok && json.data?.preview != null) {
      pass(`GET migrate with toStaffId (${to.name})`);
    } else {
      fail(`GET migrate with toStaffId: ${res.status}`);
    }

    const { res: badRes } = await api(
      "POST",
      `/api/admin/users/${from.id}/migrate`,
      cookie,
      { toStaffId: from.id },
    );
    if (badRes.status === 400) {
      pass("POST migrate same user → 400");
    } else {
      fail(`POST migrate same user expected 400, got ${badRes.status}`);
    }
  }
} else {
  fail("Need at least one active regional RM in DB (run db:seed)");
}

if (salesRm) {
  const { res, json } = await api("GET", `/api/admin/users/${salesRm.id}/migrate`, cookie);
  if (res.ok && json.data?.migratable === true) {
    pass(`GET migrate sales RM (${salesRm.name})`);
  } else {
    fail(`GET migrate sales RM: ${res.status}`);
  }
}

const { res: noBodyRes } = await api("POST", `/api/admin/users/${adminUser?.id ?? regionalRms[0].id}/migrate`, cookie, {});
if (noBodyRes.status === 400) {
  pass("POST migrate missing toStaffId → 400");
} else {
  fail(`POST migrate missing toStaffId expected 400, got ${noBodyRes.status}`);
}

if (sql && regionalRms.length >= 2) {
  const from = regionalRms[0];
  const to = regionalRms[1];
  const tag = `MIGRATE-SMOKE-${Date.now()}`;
  let leadId;
  try {
    const [lead] = await sql`
      INSERT INTO bride_leads (
        display_id, bride_name, phone, city, region, event_date, budget_tier, status, assigned_rm_id, assignment_date
      )
      VALUES (
        ${tag},
        '__MIGRATE_SMOKE__',
        ${`+9188${String(Date.now()).slice(-8)}`},
        'Delhi',
        'east'::region,
        CURRENT_DATE + 30,
        'tier_3'::budget_tier,
        'assigned',
        ${from.id}::uuid,
        CURRENT_DATE
      )
      RETURNING id
    `;
    leadId = lead.id;

    const { res: prevRes, json: prevJson } = await api(
      "GET",
      `/api/admin/users/${from.id}/migrate?toStaffId=${to.id}`,
      cookie,
    );
    const mismatch = prevJson.data?.regionMismatch;
    const body = { toStaffId: to.id };
    if (mismatch?.missingRegions?.length) {
      body.addRegionsToTarget = mismatch.missingRegions;
    }

    const { res: migRes, json: migJson } = await api(
      "POST",
      `/api/admin/users/${from.id}/migrate`,
      cookie,
      body,
    );
    if (!migRes.ok) {
      fail(`POST migrate round-trip: ${migRes.status} ${migJson.error ?? ""}`);
    } else {
      const moved = migJson.data?.moved?.brideLeadsAssigned ?? 0;
      if (moved >= 1) {
        pass(`POST migrate moved ${moved} lead(s)`);
      } else {
        fail(`POST migrate ok but moved.brideLeadsAssigned=${moved}`);
      }

      const [row] = await sql`
        SELECT assigned_rm_id::text FROM bride_leads WHERE id = ${leadId}::uuid
      `;
      if (row?.assigned_rm_id === to.id) {
        pass("DB verify lead assigned to successor");
      } else {
        fail(`DB lead assignee expected ${to.id}, got ${row?.assigned_rm_id}`);
      }

      const revertBody = { toStaffId: from.id };
      if (mismatch?.missingRegions?.length) {
        const [fromStaff] = await sql`SELECT regions::text[] FROM staff WHERE id = ${from.id}::uuid`;
        const fromRegions = fromStaff?.regions ?? [];
        const need = mismatch.missingRegions.filter((r) => !fromRegions.includes(r));
        if (need.length) revertBody.addRegionsToTarget = need;
      }
      await api("POST", `/api/admin/users/${to.id}/migrate`, cookie, revertBody);
      const [reverted] = await sql`
        SELECT assigned_rm_id::text FROM bride_leads WHERE id = ${leadId}::uuid
      `;
      if (reverted?.assigned_rm_id === from.id) {
        pass("POST revert migrate restored assignee");
      } else {
        fail("Revert migrate did not restore original assignee");
      }
    }
  } catch (e) {
    fail(`DB round-trip: ${e.message}`);
  } finally {
    if (leadId) await sql`DELETE FROM bride_leads WHERE id = ${leadId}::uuid`;
  }
} else if (!sql) {
  console.log("⚠ DATABASE_URL unset — skipped POST round-trip");
}

if (sql) {
  for (const u of reactivateAfter) {
    await sql`
      UPDATE staff SET active = false, updated_at = NOW() WHERE id = ${u.id}::uuid
    `;
  }
  await sql.end();
}

console.log(`\nStaff migrate smoke: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
