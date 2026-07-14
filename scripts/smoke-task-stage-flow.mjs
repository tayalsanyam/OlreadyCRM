#!/usr/bin/env node
/**
 * Smoke: task complete → stage panel (Details Shared) → task done.
 * Usage: node scripts/smoke-task-stage-flow.mjs [baseUrl]
 */
import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

const base = process.argv[2] ?? "http://localhost:3000";

let failed = 0;
const pass = (m) => console.log(`✓ ${m}`);
const fail = (m) => {
  failed++;
  console.log(`✗ ${m}`);
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
  return { cookie, user: json.data?.user };
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

console.log(`Task + stage flow smoke @ ${base}\n`);

const admin = await login(SMOKE_USERS.admin);
pass("login admin");

const salesRm = await login(SMOKE_USERS.salesRm);
pass("login sales RM");

const tasksRes = await get("/api/tasks?page=1&pageSize=200", salesRm.cookie);
const tasks = tasksRes.json.data?.data ?? [];
const followUp = tasks.find(
  (t) => t.taskType === "salesFollowUp" && t.title.includes("[PIPE:") && t.status !== "done",
);

let pipelineId;
let taskId;

if (followUp) {
  taskId = followUp.id;
  const m = followUp.title.match(/\[PIPE:([^\]]+)\]/);
  pipelineId = m?.[1];
  pass(`using existing task ${followUp.displayId}`);
} else {
  const phone = `9878${String(Date.now()).slice(-6)}`;
  const create = await post("/api/admin/muas", admin.cookie, {
    name: `Smoke Task ${Date.now().toString().slice(-4)}`,
    city: "Delhi",
    phone,
    source: "Inbound",
    status: "active",
  });
  if (!create.res.ok) {
    fail(`create MUA: ${create.json.error ?? create.res.status}`);
    process.exit(1);
  }
  const muaId = create.json.data?.id;
  pass(`created MUA ${create.json.data?.displayId}`);

  const unassigned = await get("/api/admin/sales/unassigned", admin.cookie);
  const row = (unassigned.json.data ?? []).find((r) => r.muaId === muaId);
  if (!row) {
    fail("no unassigned pipeline for new MUA");
    process.exit(1);
  }
  pipelineId = row.id;

  const rms = await get("/api/sales/assignable-rms", admin.cookie);
  const rm = (rms.json.data ?? []).find((u) => u.email === SALES_RM_EMAIL);
  const assign = await post("/api/admin/sales/unassigned/assign", admin.cookie, {
    pipelineId: row.id,
    salesRmId: rm.id,
  });
  if (!assign.res.ok) {
    fail(`assign: ${assign.json.error}`);
    process.exit(1);
  }
  pass("assigned to sales RM");

  const tasks2 = await get("/api/tasks?page=1&pageSize=200", salesRm.cookie);
  const t = (tasks2.json.data?.data ?? []).find(
    (x) => x.title.includes(`[PIPE:${row.id}]`) && x.taskType === "salesFollowUp",
  );
  if (!t) {
    fail("no follow-up task after admin assign");
    process.exit(1);
  }
  taskId = t.id;
  pipelineId = row.id;
  pass(`bootstrap task ${t.displayId}`);
}

const pipeRes = await get(`/api/sales/pipeline/${pipelineId}`, salesRm.cookie);
const currentStage = pipeRes.json.data?.pipeline?.stage ?? "Untouched";
pass(`pipeline stage=${currentStage}`);

const stagePatch = await patch(`/api/sales/pipeline/${pipelineId}/stage`, salesRm.cookie, {
  toStage: "Details Shared",
  note: "Smoke test shared Privy plan details with MUA on call today",
  nextTouchPoint: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
  plansShared: [{ plan: "Privy", amount: 25000 }],
});
if (!stagePatch.res.ok) {
  fail(`stage → Details Shared: ${stagePatch.json.error ?? stagePatch.res.status}`);
} else {
  pass("stage → Details Shared");
}

const complete = await patch(`/api/tasks/${taskId}`, salesRm.cookie, {
  status: "done",
  note: "Smoke completion notes after stage panel update worked fine",
  skipFollowUpSchedule: true,
});
if (!complete.res.ok) {
  fail(`task complete after stage: ${complete.json.error ?? complete.res.status}`);
} else {
  pass("task marked done (skipFollowUpSchedule)");
}

const pipeAfter = await get(`/api/sales/pipeline/${pipelineId}`, salesRm.cookie);
if (pipeAfter.json.data?.pipeline?.stage === "Details Shared") {
  pass("pipeline stage confirmed Details Shared");
} else {
  fail(`pipeline stage is ${pipeAfter.json.data?.pipeline?.stage}, expected Details Shared`);
}

const tasksAfter = await get("/api/tasks?page=1&pageSize=200", salesRm.cookie);
const stillPending = (tasksAfter.json.data?.data ?? []).find((t) => t.id === taskId);
if (stillPending) {
  fail("task still pending after complete");
} else {
  pass("task no longer pending");
}

console.log(`\n${failed === 0 ? "All task+stage checks passed." : `${failed} check(s) failed.`}`);
process.exit(failed > 0 ? 1 : 0);
