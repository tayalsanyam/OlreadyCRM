#!/usr/bin/env node
/**
 * Smoke test: commission login + queue + portal leads.
 * Usage: node scripts/smoke-commission-queue.mjs [baseUrl]
 */
import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

const base = process.argv[2] ?? "http://localhost:3000";

const MAX_MS = 15_000;

async function timed(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    const ok = ms < MAX_MS;
    console.log(`${ok ? "✓" : "⚠"} ${name} (${ms}ms)`);
    return { ok, ms, result };
  } catch (e) {
    console.log(`✗ ${name}: ${e instanceof Error ? e.message : e}`);
    return { ok: false, ms: Date.now() - t0, error: e };
  }
}

async function main() {
  console.log(`Smoke test @ ${base}\n`);

  async function doLogin() {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: SMOKE_USERS.commission,
        password: SMOKE_PASSWORD,
      }),
    });
    const json = await res.json();
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    return { res, json, cookie };
  }

  let loginAttempt = await timed("POST /api/auth/login", doLogin);
  if (loginAttempt.result?.json?.error) {
    console.log(`  retry login (${loginAttempt.result.json.error})…`);
    loginAttempt = await timed("POST /api/auth/login (retry)", doLogin);
  }
  if (!loginAttempt.result?.res?.ok || loginAttempt.result?.json?.error) {
    console.log(`✗ login failed: ${loginAttempt.result?.json?.error ?? loginAttempt.result?.res?.status}`);
    process.exit(1);
  }

  const cookie = loginAttempt.result.cookie;
  const loginJson = loginAttempt.result.json;
  console.log(`  redirect: ${loginJson.data?.redirect}`);

  const headers = cookie ? { Cookie: cookie } : {};

  const queueAllRes = await timed("GET /api/leads/queue (all regions)", async () => {
    const res = await fetch(
      `${base}/api/leads/queue?status=commission_rm&page=1&pageSize=50`,
      { headers }
    );
    const json = await res.json();
    return { res, json };
  });
  if (queueAllRes.result?.res?.ok && !queueAllRes.result?.json?.error) {
    const q = queueAllRes.result.json;
    console.log(
      `  all regions total=${q.data?.total ?? "?"} rows=${q.data?.data?.length ?? 0}`
    );
  }

  const queueRes = await timed("GET /api/leads/queue (north)", async () => {
    const res = await fetch(
      `${base}/api/leads/queue?region=north&status=commission_rm&page=1&pageSize=50`,
      { headers }
    );
    const json = await res.json();
    return { res, json };
  });
  if (queueRes.result?.res?.ok && !queueRes.result?.json?.error) {
    const q = queueRes.result.json;
    console.log(
      `  total=${q.data?.total ?? "?"} rows=${q.data?.data?.length ?? 0} error=${q.error ?? "none"}`
    );
    if (q.error) process.exit(1);
    if ((q.data?.total ?? 0) === 0) {
      console.log("  (warning: zero commission leads in DB for north)");
    }
  } else {
    process.exit(1);
  }

  const portalRes = await timed("GET /api/commission/portal-leads", async () => {
    const res = await fetch(`${base}/api/commission/portal-leads`, { headers });
    const json = await res.json();
    return { res, json };
  });
  if (portalRes.result?.res?.ok && !portalRes.result?.json?.error) {
    const p = portalRes.result.json;
    console.log(
      `  portal count=${Array.isArray(p.data) ? p.data.length : "?"} error=${p.error ?? "none"}`
    );
    if (p.error) process.exit(1);
  } else {
    process.exit(1);
  }

  const muasRes = await timed("GET /api/commission/muas", async () => {
    const res = await fetch(
      `${base}/api/commission/muas?page=1&pageSize=50`,
      { headers }
    );
    const json = await res.json();
    return { res, json };
  });
  if (muasRes.result?.res?.ok && !muasRes.result?.json?.error) {
    const m = muasRes.result.json;
    console.log(
      `  muas total=${m.data?.total ?? "?"} rows=${m.data?.data?.length ?? 0}`
    );
  } else {
    process.exit(1);
  }

  const healthRes = await timed("GET /api/leads/pipeline-health", async () => {
    const res = await fetch(`${base}/api/leads/pipeline-health`, { headers });
    const json = await res.json();
    return { res, json };
  });
  if (healthRes.result?.res?.ok && !healthRes.result?.json?.error) {
    console.log(`  health leads=${healthRes.result.json.data?.length ?? 0}`);
  }

  const pageRes = await timed("GET /commission/queue", () =>
    fetch(`${base}/commission/queue`, { headers, redirect: "manual" })
  );
  if (pageRes.result) {
    const status = pageRes.result.status;
    console.log(`  page status=${status}`);
    if (status >= 400) process.exit(1);
  }

  console.log("\nAll smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
