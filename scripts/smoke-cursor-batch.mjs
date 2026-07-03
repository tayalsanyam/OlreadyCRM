#!/usr/bin/env node
/**
 * Smoke test for Cursor 33-change batch (API surface).
 * Usage: node scripts/smoke-cursor-batch.mjs [baseUrl]
 */
import { SMOKE_USERS, smokeLogin } from "./smoke-env.mjs";

const base = process.argv[2] ?? "http://localhost:3000";

const USERS = [
  { label: "admin", email: SMOKE_USERS.admin },
  { label: "rm", email: SMOKE_USERS.rm },
  { label: "commission", email: SMOKE_USERS.commission },
  { label: "uploader", email: SMOKE_USERS.uploader },
];

let failed = 0;

function fail(msg) {
  console.log(`✗ ${msg}`);
  failed++;
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

async function login(email) {
  return smokeLogin(base, email);
}

async function get(path, cookie, expectOk = true) {
  const res = await fetch(`${base}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const json = await res.json().catch(() => ({}));
  if (expectOk && (!res.ok || json.error)) {
    throw new Error(`${path}: ${json.error ?? res.status}`);
  }
  return { res, json };
}

async function main() {
  console.log(`Cursor batch smoke @ ${base}\n`);

  const sessions = {};
  for (const u of USERS) {
    try {
      sessions[u.label] = await login(u.email);
      pass(`login ${u.label}`);
    } catch (e) {
      fail(`login ${u.label}: ${e.message}`);
    }
  }

  if (!sessions.admin) {
    console.log("\nCannot continue without admin session.");
    process.exit(1);
  }

  const admin = sessions.admin.cookie;
  const rm = sessions.rm?.cookie ?? admin;
  const commission = sessions.commission?.cookie ?? admin;
  const uploader = sessions.uploader?.cookie ?? admin;

  const checks = [
    ["GET /api/cities", () => get("/api/cities", admin)],
    [
      "GET /api/leads/queue (RM) + activePushStages",
      async () => {
        const { json } = await get(
          "/api/leads/queue?status=assigned&region=north&page=1&pageSize=5",
          rm
        );
        const row = json.data?.data?.[0];
        if (row && !("activePushStages" in row)) {
          throw new Error("missing activePushStages on queue row");
        }
        return json;
      },
    ],
    [
      "GET /api/leads/queue (commission_rm)",
      () =>
        get(
          "/api/leads/queue?status=commission_rm&page=1&pageSize=5",
          commission
        ),
    ],
    ["GET /api/upload/leads?tab=not_interested", () => get("/api/upload/leads?tab=not_interested", uploader)],
    ["GET /api/upload/leads?tab=pending", () => get("/api/upload/leads?tab=pending", uploader)],
    ["GET /api/admin/users", () => get("/api/admin/users", admin)],
    ["GET /api/admin/cities", () => get("/api/admin/cities", admin)],
    ["GET /api/admin/config", () => get("/api/admin/config", admin)],
    ["GET /api/admin/feedback", () => get("/api/admin/feedback", admin)],
    ["GET /api/admin/mua-prospects", () => get("/api/admin/mua-prospects", admin)],
    [
      "GET /api/admin/leads/assigned",
      () => get("/api/admin/leads/assigned?page=1&pageSize=5", admin),
    ],
    [
      "GET /api/admin/bookings/by-mua",
      () => get("/api/admin/bookings/by-mua", admin),
    ],
    [
      "GET /api/admin/reports/ni-leads",
      () => get("/api/admin/reports/ni-leads", admin),
    ],
    [
      "GET /api/admin/reports/lead-journey + activityFrom",
      () =>
        get(
          "/api/admin/reports/lead-journey?activityFrom=2020-01-01&page=1",
          admin
        ),
    ],
    [
      "GET /api/admin/reports/revenue + bookingFrom",
      () =>
        get(
          "/api/admin/reports/revenue?bookingFrom=2024-01-01&bookingTo=2026-12-31",
          admin
        ),
    ],
    [
      "GET /api/commission/muas",
      () => get("/api/commission/muas?page=1&pageSize=10", commission),
    ],
    [
      "GET /api/tasks (RM)",
      () => get("/api/tasks?page=1&pageSize=5", rm),
    ],
    [
      "GET /api/leads/pipeline-health",
      () => get("/api/leads/pipeline-health?region=north", rm),
    ],
  ];

  for (const [name, fn] of checks) {
    try {
      await fn();
      pass(name);
    } catch (e) {
      fail(`${name}: ${e.message}`);
    }
  }

  // Page routes (HTML)
  const pages = [
    ["/admin/users", admin],
    ["/admin/feedback", admin],
    ["/admin/mua-prospects", admin],
    ["/admin/config", admin],
    ["/upload/leads", uploader],
    ["/rm/queue", rm],
    ["/commission/queue", commission],
    ["/commission/muas", commission],
    ["/rm/tasks", rm],
  ];

  for (const [path, cookie] of pages) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: cookie ? { Cookie: cookie } : {},
        redirect: "manual",
      });
      if (res.status >= 400) throw new Error(`status ${res.status}`);
      pass(`GET ${path} (${res.status})`);
    } catch (e) {
      fail(`GET ${path}: ${e.message}`);
    }
  }

  console.log(`\n${failed === 0 ? "All checks passed." : `${failed} check(s) failed.`}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
