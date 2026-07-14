#!/usr/bin/env node
/**
 * Smoke test: lead uploader, regional RM, commission RM touch points.
 * Usage: node scripts/smoke-rm-flows.mjs [baseUrl]
 */

import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PASS = SMOKE_PASSWORD;

const ROLES = {
  uploader: { email: SMOKE_USERS.uploader, label: "Lead Uploader" },
  rm: { email: SMOKE_USERS.rm, label: "Regional RM" },
  commission: { email: SMOKE_USERS.commission, label: "Commission RM" },
};

const results = [];
let cookieJar = "";

function record(role, check, ok, detail = "") {
  results.push({ role, check, ok, detail });
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} [${role}] ${check}${detail ? ` — ${detail}` : ""}`);
}

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() ?? [];
  const pairs = raw.map((line) => line.split(";")[0]).filter(Boolean);
  if (!pairs.length) return;
  const map = new Map(
    cookieJar
      .split("; ")
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i), p.slice(i + 1)];
      }),
  );
  for (const pair of pairs) {
    const i = pair.indexOf("=");
    map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  cookieJar = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  parseSetCookie(res.headers);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, text, json };
}

async function login(key) {
  cookieJar = "";
  const { status, json } = await request("POST", "/api/auth/login", {
    email: ROLES[key].email,
    password: PASS,
  });
  const ok = status === 200 && json?.data?.redirect;
  record(key, `Login (${ROLES[key].label})`, ok, ok ? json.data.redirect : json?.error ?? `HTTP ${status}`);
  if (!ok) throw new Error(`Login failed for ${ROLES[key].email}`);
}

async function page(key, path, expect = 200) {
  const { status } = await request("GET", path);
  const ok = status === expect || (expect === 200 && status === 307);
  record(key, `Page ${path}`, ok, `HTTP ${status}`);
}

async function api(key, method, path, body, expectOk = true) {
  const { status, json } = await request(method, path, body);
  const ok = expectOk ? status >= 200 && status < 300 && json?.error == null : true;
  record(
    key,
    `${method} ${path}`,
    ok,
    json?.error ?? (json?.data != null ? "ok" : `HTTP ${status}`),
  );
  return json;
}

async function smokeUploader() {
  const role = "uploader";
  console.log("\n=== Lead Uploader ===");
  await login(role);
  await page(role, "/upload/leads");
  await page(role, "/upload/referrals");
  await api(role, "GET", "/api/upload/leads");
  await api(role, "GET", "/api/cities");
  await api(role, "GET", "/api/whatsapp/templates");

  const leads = await api(role, "GET", "/api/upload/leads");
  const list = Array.isArray(leads?.data) ? leads.data : leads?.data?.leads ?? [];
  const pending = list.find((l) => l.status === "pending_verification") ?? list[0];
  if (pending?.id) {
    await api(role, "GET", `/api/leads/${pending.id}`);
    await api(role, "GET", `/api/leads/${pending.id}/makeup-look`);
    await api(role, "POST", `/api/leads/${pending.id}/ai-assist`, {
      message: "What to ask about makeup style?",
      context: "verification",
    });
    await api(role, "POST", "/api/whatsapp/polish-message", {
      draft: "Hi {brideName}, confirming your makeup enquiry in {city}.",
      audience: "bride",
      brideName: pending.brideName ?? "Test",
    });
    record(role, "Verify flow APIs", true, `lead ${pending.id.slice(0, 8)}…`);
  } else {
    record(role, "Lead for verify APIs", false, "no leads");
  }
}

async function smokeRm() {
  const role = "rm";
  console.log("\n=== Regional RM ===");
  await login(role);
  await page(role, "/rm/queue");
  await page(role, "/rm/tasks");
  await page(role, "/rm/bookings");
  await page(role, "/rm/muas");
  await page(role, "/rm/reports");
  await api(role, "GET", "/api/leads/queue?status=assigned");
  await api(role, "GET", "/api/tasks");
  await api(role, "GET", "/api/cities");
  await api(role, "GET", "/api/whatsapp/templates");

  const queue = await api(role, "GET", "/api/leads/queue?status=assigned");
  const lead = queue?.data?.data?.[0] ?? queue?.data?.[0];
  if (lead?.id) {
    await page(role, `/rm/leads/${lead.id}`);
    await api(role, "GET", `/api/leads/${lead.id}`);
    await api(role, "GET", `/api/leads/${lead.id}/pushes`);
    await api(role, "GET", `/api/leads/${lead.id}/makeup-look`);
    await api(role, "POST", `/api/leads/${lead.id}/ai-assist`, {
      message: "How to counsel on HD vs natural?",
      context: "makeup",
    });
    await api(role, "POST", "/api/whatsapp/polish-message", {
      draft: "Hi {muaName}, following up on the Olready enquiry.",
      audience: "mua",
      muaName: "Test MUA",
    });
    const pushes = await api(role, "GET", `/api/leads/${lead.id}/pushes`);
    const active = pushes?.data?.find?.(
      (p) => p.status === "active" || p.status === "awaitingClose",
    );
    record(
      role,
      "MUA WhatsApp (phone on push)",
      !!(active?.muaPhone || active?.muaWhatsapp),
      active?.muaName ?? "no active push",
    );
  } else {
    record(role, "Assigned lead in queue", false, "empty queue");
  }
}

async function smokeCommission() {
  const role = "commission";
  console.log("\n=== Commission RM ===");
  await login(role);
  await page(role, "/commission/queue");
  await page(role, "/commission/bookings");
  await page(role, "/commission/muas");
  await page(role, "/commission/reports");
  await page(role, "/rm/tasks");
  await api(role, "GET", "/api/leads/queue?status=commission_rm");
  await api(role, "GET", "/api/tasks");
  await api(role, "GET", "/api/commission/muas");
  await api(role, "GET", "/api/whatsapp/templates");
  await api(role, "GET", "/api/whatsapp/saved-templates");

  const queue = await api(role, "GET", "/api/leads/queue?status=commission_rm");
  const lead = queue?.data?.data?.[0] ?? queue?.data?.[0];
  if (lead?.id) {
    await page(role, `/rm/leads/${lead.id}`);
    await api(role, "GET", `/api/leads/${lead.id}`);
    await api(role, "GET", `/api/leads/${lead.id}/pushes`);
    await api(role, "PATCH", `/api/leads/${lead.id}/commission`, {
      commissionOffered: 500,
      commissionAgreed: 400,
    });
    const save = await api(role, "POST", "/api/whatsapp/saved-templates", {
      label: "Smoke test template",
      body: "Hi {muaName} — smoke test message for Olready.\n\nTeam Olready\n8699889901",
      pool: "rmMua",
    });
    if (save?.data?.id) {
      await api(role, "DELETE", `/api/whatsapp/saved-templates/${save.data.id}`);
      record(role, "Save/delete team template", true);
    }
  } else {
    record(role, "Commission queue lead", false, "empty queue");
  }
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);
  try {
    await smokeUploader();
    await smokeRm();
    await smokeCommission();
  } catch (e) {
    console.error("\nFatal:", e.message);
    process.exitCode = 1;
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Summary ---");
  console.log(
    `Total: ${results.length} | Passed: ${results.length - failed.length} | Failed: ${failed.length}`,
  );
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - [${f.role}] ${f.check}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main();
