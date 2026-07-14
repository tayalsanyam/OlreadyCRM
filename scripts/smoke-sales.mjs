#!/usr/bin/env node
/**
 * Sales-side smoke test (API + page + role contract checks).
 * Usage: node scripts/smoke-sales.mjs [baseUrl]
 */
import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

const base = process.argv[2] ?? "http://localhost:3000";

let failed = 0;
let warned = 0;
const REQUEST_TIMEOUT_MS = 20000;

function pass(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  failed++;
  console.log(`✗ ${msg}`);
}
function warn(msg) {
  warned++;
  console.log(`⚠ ${msg}`);
}

async function login(email) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  const json = await res.json().catch(() => ({}));
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok || json.error || !cookie) throw new Error(json.error ?? `login ${res.status}`);
  return { cookie, user: json.data?.user ?? null };
}

async function getJson(path, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(`${base}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function postJson(path, cookie, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function getPage(path, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(`${base}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  return res;
}

async function checkApiOk(label, path, cookie) {
  try {
    const { res, json } = await getJson(path, cookie);
    if (!res.ok || json.error) {
      fail(`${label}: ${json.error ?? res.status}`);
      return null;
    }
    pass(label);
    return json.data;
  } catch (e) {
    fail(`${label}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log(`Sales smoke @ ${base}\n`);

  let admin = null;
  let salesRm = null;
  let salesTl = null;

  try {
    admin = await login(SMOKE_USERS.admin);
    pass("login admin");
  } catch (e) {
    fail(`login admin: ${e.message}`);
    process.exit(1);
  }

  try {
    salesRm = await login(SMOKE_USERS.salesRm);
    pass("login sales rm");
  } catch (e) {
    warn(`login sales rm failed (${e.message}) — using admin session as fallback`);
    salesRm = admin;
  }

  try {
    salesTl = await login(SMOKE_USERS.salesTl);
    pass("login sales tl");
  } catch (e) {
    warn(`login sales tl failed (${e.message}) — using admin session as fallback`);
    salesTl = admin;
  }

  // Core sales APIs
  await checkApiOk("GET /api/sales/pipeline", "/api/sales/pipeline?mua_type=candidate", salesRm.cookie);
  await checkApiOk("GET /api/sales/analysis/team-pipeline", "/api/sales/analysis/team-pipeline?page=1&page_size=20", salesTl.cookie);
  await checkApiOk("GET /api/sales/analysis/funnel", "/api/sales/analysis/funnel", salesTl.cookie);
  await checkApiOk("GET /api/sales/analysis/individual", "/api/sales/analysis/individual", salesTl.cookie);
  await checkApiOk("GET /api/sales/analysis/targets", "/api/sales/analysis/targets?month=2026-05", salesTl.cookie);
  await checkApiOk("GET /api/sales/reports/pipeline-summary", "/api/sales/reports/pipeline-summary", salesRm.cookie);
  await checkApiOk("GET /api/sales/reports/call-activity", "/api/sales/reports/call-activity", salesRm.cookie);
  await checkApiOk("GET /api/sales/reports/targets", "/api/sales/reports/targets?month=2026-05", salesRm.cookie);

  // Admin sales report APIs
  await checkApiOk("GET /api/admin/sales/reports/overview", "/api/admin/sales/reports/overview?month=2026-05", admin.cookie);
  await checkApiOk("GET /api/admin/sales/reports/source-analysis", "/api/admin/sales/reports/source-analysis?month=2026-05", admin.cookie);
  await checkApiOk("GET /api/admin/sales/reports/conversion-funnel", "/api/admin/sales/reports/conversion-funnel?month=2026-05", admin.cookie);
  await checkApiOk("GET /api/admin/sales/reports/call-activity", "/api/admin/sales/reports/call-activity?month=2026-05", admin.cookie);
  await checkApiOk("GET /api/admin/sales/reports/target-tracking", "/api/admin/sales/reports/target-tracking?month=2026-05", admin.cookie);
  await checkApiOk("GET /api/admin/sales/reports/activation-queue", "/api/admin/sales/reports/activation-queue", admin.cookie);
  await checkApiOk("GET /api/admin/sales/reports/churned-muas", "/api/admin/sales/reports/churned-muas", admin.cookie);

  // Custom report role behavior
  const adminCustom = await getJson("/api/admin/sales/reports/custom", admin.cookie);
  if (adminCustom.res.ok && !adminCustom.json.error) {
    const keys = (adminCustom.json.data?.fields ?? []).map((f) => f.key);
    if (keys.includes("muaPhone")) pass("admin custom fields include muaPhone");
    else fail("admin custom fields missing muaPhone");
  } else {
    fail(`admin custom GET: ${adminCustom.json.error ?? adminCustom.res.status}`);
  }

  const rmCustom = await getJson("/api/admin/sales/reports/custom", salesRm.cookie);
  if (rmCustom.res.ok && !rmCustom.json.error) {
    const keys = (rmCustom.json.data?.fields ?? []).map((f) => f.key);
    if (!keys.includes("muaPhone")) pass("sales RM custom fields hide muaPhone");
    else fail("sales RM custom fields should not include muaPhone");
  } else {
    fail(`sales RM custom GET: ${rmCustom.json.error ?? rmCustom.res.status}`);
  }

  const rmRun = await postJson(
    "/api/admin/sales/reports/custom",
    salesRm.cookie,
    {
      action: "run",
      fields: ["pipelineId", "muaName", "muaPhone", "stage"],
      filters: {},
      page: 1,
      pageSize: 20,
    }
  );
  if (!rmRun.res.ok || rmRun.json.error) {
    fail(`sales RM custom run: ${rmRun.json.error ?? rmRun.res.status}`);
  } else {
    const headers = rmRun.json.data?.headers ?? [];
    if (headers.includes("MUA Phone")) fail("sales RM custom run leaked MUA Phone header");
    else pass("sales RM custom run enforces phone masking");
  }

  // Sales pages
  const pages = [
    ["/sales/pipeline", salesRm.cookie],
    ["/sales/reports", salesRm.cookie],
    ["/sales/analysis", salesTl.cookie],
    ["/admin/sales/overview", admin.cookie],
    ["/admin/sales/reports", admin.cookie],
  ];
  for (const [path, cookie] of pages) {
    try {
      const res = await getPage(path, cookie);
      if (res.status >= 400) fail(`GET ${path}: status ${res.status}`);
      else pass(`GET ${path} (${res.status})`);
    } catch (e) {
      fail(`GET ${path}: ${e.message}`);
    }
  }

  console.log(`\n${failed === 0 ? "All sales checks passed." : `${failed} sales check(s) failed.`}`);
  if (warned) console.log(`${warned} warning(s).`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
