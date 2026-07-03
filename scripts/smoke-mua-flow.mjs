#!/usr/bin/env node
/**
 * End-to-end: Add MUA → unassigned list → assign sales RM → visibility checks.
 * Usage: node scripts/smoke-mua-flow.mjs [baseUrl]
 */
import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

const base = process.argv[2] ?? "http://localhost:3001";

let failed = 0;
const pass = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  failed++;
  console.log(`✗ ${msg}`);
};

async function login(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!res.ok || json.error || !cookie) throw new Error(json.error ?? `login ${res.status}`);
  return { cookie, user: json.data?.user ?? null };
}

async function get(path, cookie) {
  const res = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function post(path, cookie, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function unassignedItems(json) {
  const data = json?.data;
  if (Array.isArray(data)) return data;
  const items = data?.items;
  return Array.isArray(items) ? items : [];
}

async function main() {
  console.log(`MUA flow smoke @ ${base}\n`);

  let admin;
  let salesRm;
  let salesTl;
  let commissionRm;

  try {
    admin = await login(SMOKE_USERS.admin);
    pass(`login admin (${admin.user?.name ?? "Kanika"})`);
  } catch (e) {
    fail(`login admin: ${e.message}`);
    process.exit(1);
  }

  for (const [label, email] of [
    ["sales TL", SMOKE_USERS.salesTl],
    ["sales RM", SMOKE_USERS.salesRm],
    ["commission RM", SMOKE_USERS.commission],
  ]) {
    try {
      const s = await login(email);
      pass(`login ${label} (${s.user?.name ?? email})`);
      if (label === "sales TL") salesTl = s;
      if (label === "sales RM") salesRm = s;
      if (label === "commission RM") commissionRm = s;
    } catch (e) {
      fail(`login ${label} (${email}): ${e.message}`);
    }
  }

  const testPhone = "9878166444";
  const testName = `Smoke Sanyam ${Date.now().toString().slice(-4)}`;

  // 1. Unassigned before
  const before = await get("/api/admin/sales/unassigned", admin.cookie);
  if (!before.res.ok || before.json.error) {
    fail(`GET /api/admin/sales/unassigned: ${before.json.error ?? before.res.status}`);
  } else {
    pass(`unassigned before: ${unassignedItems(before.json).length} rows`);
  }

  // 2. Create MUA
  const create = await post("/api/admin/muas", admin.cookie, {
    name: testName,
    city: "Delhi",
    phone: testPhone,
    source: "Instagram DM",
    status: "active",
  });

  if (!create.res.ok || create.json.error) {
    fail(`POST /api/admin/muas: ${create.json.error ?? create.res.status}`);
    console.log("  detail:", JSON.stringify(create.json));
  } else {
    const mua = create.json.data;
    pass(`created MUA ${mua?.displayId} (${mua?.id})`);

    // 3. Unassigned after
    const unassigned = await get(
      `/api/admin/sales/unassigned?q=${encodeURIComponent(testName)}&pageSize=20`,
      admin.cookie,
    );
    if (!unassigned.res.ok || unassigned.json.error) {
      fail(`GET unassigned after create: ${unassigned.json.error ?? unassigned.res.status}`);
    } else {
      const rows = unassignedItems(unassigned.json);
      const found = rows.find((r) => r.muaId === mua.id);
      if (found) {
        pass(`unassigned list includes new MUA (type=${found.muaType}, pipeline=${found.id})`);
      } else {
        fail(`unassigned list missing new MUA (count=${rows.length}, muaId=${mua.id})`);
        // DB diagnostic via count endpoint
        const cnt = await get("/api/admin/sales/unassigned/count", admin.cookie);
        console.log(`  unassigned count API: ${cnt.json.data?.count}`);
      }

      // 4. Assign to sales RM
      const assignable = await get("/api/sales/assignable-rms", admin.cookie);
      const rm =
        (assignable.json.data ?? []).find((u) => u.role === "salesRm" && u.email === SMOKE_USERS.salesRm) ??
        (assignable.json.data ?? []).find((u) => u.role === "salesRm");

      if (!rm) {
        fail("no sales RM in assignable-rms");
      } else if (found) {
        const assign = await post("/api/admin/sales/unassigned/assign", admin.cookie, {
          pipelineId: found.id,
          salesRmId: rm.id,
        });
        if (!assign.res.ok || assign.json.error) {
          fail(`assign pipeline: ${assign.json.error ?? assign.res.status}`);
        } else {
          pass(`assigned to ${rm.name}`);

          // 5. Sales RM sees in pipeline
          if (salesRm) {
            const pipe = await get("/api/sales/pipeline?mua_type=candidate", salesRm.cookie);
            if (!pipe.res.ok || pipe.json.error) {
              fail(`sales RM pipeline GET: ${pipe.json.error ?? pipe.res.status}`);
            } else {
              const inPipe = (pipe.json.data ?? []).some(
                (p) => p.muaId === mua.id || p.muaName === testName
              );
              if (inPipe) pass("sales RM sees MUA in pipeline");
              else fail(`sales RM pipeline missing MUA (count=${pipe.json.data?.length ?? 0})`);
            }
          }

          // 6. Commission RM sees in MUA database
          if (commissionRm) {
            const comm = await get("/api/commission/muas?page=1&pageSize=50", commissionRm.cookie);
            if (!comm.res.ok || comm.json.error) {
              fail(`commission muas GET: ${comm.json.error ?? comm.res.status}`);
            } else {
              const items = comm.json.data?.data ?? [];
              const hit = items.some((m) => m.id === mua.id || m.name === testName);
              if (hit) pass("commission RM sees MUA in database");
              else fail(`commission RM MUA list missing record (count=${items.length})`);
            }
          }
        }
      }
    }

    // Cleanup: delete test MUA (best-effort via knowing id)
    console.log(`\nCleanup: test MUA ${mua.displayId} left in DB for inspection (phone ${testPhone})`);
  }

  // Sales smoke subset with real accounts
  if (salesTl) {
    const funnel = await get("/api/sales/analysis/funnel", salesTl.cookie);
    if (!funnel.res.ok || funnel.json.error) fail(`sales TL funnel: ${funnel.json.error ?? funnel.res.status}`);
    else pass("sales TL funnel API OK");
  }

  console.log(`\n${failed === 0 ? "All MUA flow checks passed." : `${failed} check(s) failed.`}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
