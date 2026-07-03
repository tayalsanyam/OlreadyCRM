#!/usr/bin/env node
/**
 * Smoke: WhatsApp + geography features added 2026-06-11
 * Usage: node scripts/smoke-whatsapp-geography.mjs [baseUrl]
 */
import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

const base = process.argv[2] ?? "http://localhost:3000";

let failed = 0;
const pass = (m) => console.log(`✓ ${m}`);
const fail = (m) => {
  failed++;
  console.log(`✗ ${m}`);
};
const warn = (m) => console.log(`⚠ ${m}`);

async function login(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!res.ok || json.error || !cookie) throw new Error(json.error ?? `login ${res.status}`);
  return cookie;
}

async function get(path, cookie) {
  const res = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  return { res, json: await res.json().catch(() => ({})) };
}

async function post(path, cookie, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json().catch(() => ({})) };
}

async function patch(path, cookie, body) {
  const res = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json().catch(() => ({})) };
}

console.log(`WhatsApp + geography smoke @ ${base}\n`);

let salesCookie;
let rmCookie;
let adminCookie;
let pipelineId;

try {
  salesCookie = await login(SMOKE_USERS.salesRm);
  pass(`login ${SMOKE_USERS.salesRm}`);
} catch (e) {
  fail(`login sales RM: ${e.message}`);
  process.exit(1);
}

try {
  rmCookie = await login(SMOKE_USERS.rm);
  pass(`login ${SMOKE_USERS.rm}`);
} catch (e) {
  fail(`login RM: ${e.message}`);
}

try {
  adminCookie = await login(SMOKE_USERS.admin);
  pass(`login ${SMOKE_USERS.admin}`);
} catch (e) {
  fail(`login admin: ${e.message}`);
}

// Cities with state
const cities = await get("/api/cities", salesCookie);
if (!cities.res.ok || cities.json.error) {
  fail(`GET /api/cities: ${cities.json.error ?? cities.res.status}`);
} else {
  const rows = cities.json.data ?? [];
  const withState = rows.filter((c) => c.state);
  if (withState.length >= 40) pass(`GET /api/cities — ${withState.length} cities with state`);
  else fail(`GET /api/cities — only ${withState.length} cities have state`);
}

// Sales tasks with phone fields
const salesTasks = await get("/api/tasks?page=1&pageSize=200", salesCookie);
const salesList = salesTasks.json.data?.data ?? [];
const salesTask = salesList.find((t) => t.taskType === "salesFollowUp" && t.salesPipelineMuaPhone);
if (salesTask) {
  pass(`sales task has MUA phone (${salesTask.salesPipelineMuaName})`);
  pipelineId = salesTask.salesPipelineId ?? salesTask.title.match(/\[PIPE:([^\]]+)\]/)?.[1];
} else {
  fail(`no sales follow-up task with MUA phone (${SMOKE_USERS.salesRm})`);
}

// RM push task with phones + city
if (rmCookie) {
  const rmTasks = await get("/api/tasks?page=1&pageSize=200", rmCookie);
  const rmList = rmTasks.json.data?.data ?? [];
  const pushTask = rmList.find((t) => t.pushId && t.taskType === "followUp");
  if (pushTask?.muaPhone && pushTask?.leadPhone && pushTask?.muaCity) {
    pass(`RM push task has MUA phone, bride phone, MUA city (${pushTask.muaName})`);
  } else if (pushTask) {
    fail(`RM push task missing phone/city fields: phone=${Boolean(pushTask.muaPhone)} lead=${Boolean(pushTask.leadPhone)} city=${Boolean(pushTask.muaCity)}`);
  } else {
    fail(`no RM follow-up push task for ${SMOKE_USERS.rm}`);
  }
}

// Onboarding PATCH with states
if (pipelineId) {
  const onboardingPatch = await patch(`/api/sales/pipeline/${pipelineId}/onboarding`, salesCookie, {
    plan: "Prime",
    leadCap: 20,
    leadBudget: "Tier 2",
    states: ["Delhi"],
    regions: ["north"],
    cities: ["Delhi"],
    socialMedia: "@demo_smoke",
    durationStart: "2026-06-01",
    durationEnd: "2026-12-31",
  });
  if (onboardingPatch.res.ok) pass("PATCH onboarding with states");
  else fail(`PATCH onboarding: ${onboardingPatch.json.error ?? onboardingPatch.res.status}`);
}

// WhatsApp comms log (sales)
if (pipelineId) {
  const wa = await post(`/api/sales/pipeline/${pipelineId}/comms`, salesCookie, {
    entryType: "whatsappLogged",
    description: "Smoke test WhatsApp opened (MUA): Follow up",
    metadata: { templateId: "sales-follow-up", audience: "mua", smoke: true },
  });
  if (wa.res.ok) pass("POST sales pipeline whatsappLogged");
  else fail(`POST sales whatsappLogged: ${wa.json.error ?? wa.res.status}`);
}

// RM assigned queue — verify RM can load assigned leads
if (rmCookie) {
  const queue = await get("/api/leads/queue?status=assigned&region=north&page=1&pageSize=20", rmCookie);
  const rows = queue.json.data?.data ?? [];
  if (queue.res.ok && rows.length) {
    pass(`RM queue has ${rows.length} assigned lead(s) (${SMOKE_USERS.rm})`);
  } else if (queue.res.ok) {
    warn(`RM assigned queue empty for ${SMOKE_USERS.rm} — no leads to test bride WhatsApp`);
  } else {
    fail(`RM queue failed (${queue.json.error ?? queue.res.status})`);
  }
}

// WhatsApp comms log (RM lead)
if (rmCookie) {
  const queue = await get("/api/leads/queue?status=assigned&region=north&page=1&pageSize=5", rmCookie);
  const leadId = queue.json.data?.data?.[0]?.id;
  if (leadId) {
    const wa = await post(`/api/leads/${leadId}/comms`, rmCookie, {
      type: "whatsapp",
      description: "Smoke test WhatsApp opened (Bride): profile sharing",
      metadata: { templateId: "rm-bride-profiles", audience: "bride", smoke: true },
    });
    if (wa.res.ok) pass("POST lead whatsapp comms");
    else fail(`POST lead whatsapp: ${wa.json.error ?? wa.res.status}`);
  } else {
    fail("no lead for RM whatsapp comms test");
  }
}

// UI pages
const pages = [
  ["/sales/tasks", salesCookie],
  ["/rm/tasks", rmCookie],
  ["/admin/config", adminCookie],
];
for (const [path, cookie] of pages) {
  if (!cookie) continue;
  const res = await fetch(`${base}${path}`, { headers: { Cookie: cookie }, redirect: "manual" });
  if (res.status >= 400) fail(`GET ${path}: ${res.status}`);
  else pass(`GET ${path} (${res.status})`);
}

console.log(`\n${failed === 0 ? "All WhatsApp + geography checks passed." : `${failed} check(s) failed.`}`);
process.exit(failed > 0 ? 1 : 0);
