#!/usr/bin/env node
/**
 * Budget tier smoke: coercion (string budgets from DB) + boundary tiers + API verify.
 * Usage: node scripts/smoke-budget-tier.mjs [baseUrl]
 */
import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

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
  if (!res.ok || json.error) throw new Error(json.error ?? `login ${res.status}`);
  return { cookie };
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
  return `${url}${sep}options=-c%20search_path%3Drm`;
}

async function runUnitTests() {
  const {
    coerceBudgetAmount,
    sumCeremonyBudgets,
    resolveBudgetTierFromAmount,
    DEFAULT_BUDGET_TIER_LIMITS,
  } = await import("../lib/budget-tier.ts");

  const limits = DEFAULT_BUDGET_TIER_LIMITS;

  // Regression: string budgets must not concatenate (0 + "40000" → "040000")
  const stringSum = sumCeremonyBudgets([{ budget: "40000" }]);
  if (stringSum === 40000) pass("sumCeremonyBudgets coerces string '40000' → 40000");
  else fail(`string budget sum: expected 40000, got ${stringSum} (${typeof stringSum})`);

  const multiString = sumCeremonyBudgets([
    { budget: "20000" },
    { budget: "20000" },
  ]);
  if (multiString === 40000) pass("sumCeremonyBudgets sums two string budgets → 40000");
  else fail(`multi string sum: expected 40000, got ${multiString}`);

  const tier40k = resolveBudgetTierFromAmount("40000", limits);
  if (tier40k === "tier2") pass("₹40,000 (string) → tier2");
  else fail(`₹40,000 string tier: expected tier2, got ${tier40k}`);

  const tier40kNum = resolveBudgetTierFromAmount(40000, limits);
  if (tier40kNum === "tier2") pass("₹40,000 (number) → tier2");
  else fail(`₹40,000 number tier: expected tier2, got ${tier40kNum}`);

  const cases = [
    [0, "tier1"],
    [25000, "tier1"],
    [25001, "tier2"],
    [50000, "tier2"],
    [50001, "tier3"],
    [100000, "tier3"],
    [100001, "tier4"],
    [150000, "tier4"],
  ];
  for (const [amount, expected] of cases) {
    const got = resolveBudgetTierFromAmount(amount, limits);
    if (got === expected) pass(`₹${amount.toLocaleString("en-IN")} → ${expected}`);
    else fail(`₹${amount} boundary: expected ${expected}, got ${got}`);
  }

  if (coerceBudgetAmount("040000") === 40000) pass("coerceBudgetAmount strips leading zeros");
  else fail("coerceBudgetAmount failed on '040000'");

  if (coerceBudgetAmount(null) === 0 && coerceBudgetAmount("") === 0) {
    pass("coerceBudgetAmount null/empty → 0");
  } else fail("coerceBudgetAmount null/empty");
}

async function runApiTests() {
  const postgresMod = dbUrl() ? await import("postgres") : null;
  const postgres = postgresMod?.default;
  const sql = postgres
    ? postgres(dbUrl(), {
        transform: postgres.camel,
        ssl: dbUrl().includes("supabase.co") ? "require" : false,
        max: 1,
        idle_timeout: 5,
      })
    : null;

  if (!sql) {
    fail("DATABASE_URL missing — skipping API verify tier tests");
    return;
  }

  let uploader;
  try {
    uploader = await login(SMOKE_USERS.uploader);
  } catch (e) {
    fail(`login: ${e.message}`);
    await sql.end({ timeout: 1 });
    return;
  }

  const stamp = Date.now();
  const phone = `88888${String(stamp).slice(-5)}`;
  const future = new Date();
  future.setMonth(future.getMonth() + 6);
  const futureStr = future.toISOString().slice(0, 10);

  const cfg = await api("GET", "/api/upload/config", uploader.cookie);
  const limits = cfg.json.data?.budgetTierLimits;
  if (limits?.tier2?.min === 25001) pass("Upload config has tier2 min 25001");
  else fail("Upload config budgetTierLimits missing or wrong");

  const create = await api("POST", "/api/upload/leads/create", uploader.cookie, {
    brideName: `TierSmoke ${stamp}`,
    phone,
    city: "Delhi",
    region: "north",
    source: "Smoke tier",
    ceremonies: [
      {
        name: "Wedding",
        budget: 40000,
        date: futureStr,
        description: "Single ceremony tier2 boundary",
        location: "Delhi",
      },
    ],
  });
  const leadId =
    create.json.data?.lead?.id ?? create.json.data?.id ?? create.json.data?.leadId;
  if (!create.res.ok || !leadId) {
    fail(`create lead: ${create.json.error ?? create.res.status}`);
    await sql.end({ timeout: 1 });
    return;
  }
  pass(`Created lead ${leadId.slice(0, 8)}… for ₹40k verify`);

  const verify = await api("POST", `/api/upload/leads/${leadId}/verify`, uploader.cookie, {
    verifiedViaCall: true,
    talkedTo: "bride",
    assignmentRegion: "north",
    ceremonies: [
      {
        name: "Wedding",
        budget: 40000,
        date: futureStr,
        location: "Delhi",
      },
    ],
  });
  if (!verify.res.ok) {
    fail(`verify ₹40k lead: ${verify.json.error ?? verify.res.status}`);
  } else {
    pass("Verified lead with ₹40k single ceremony");
  }

  const [row] = await sql`
    SELECT budget_tier::text AS tier, budget_amount AS amount
    FROM bride_leads WHERE id = ${leadId}::uuid
  `;
  if (row?.tier === "tier_2" && Number(row.amount) === 40000) {
    pass("DB: verify persisted tier_2 and budget_amount 40000");
  } else {
    fail(`DB after ₹40k verify: tier=${row?.tier} amount=${row?.amount}`);
  }

  const ceremoniesRes = await api(
    "GET",
    `/api/upload/leads/${leadId}/ceremonies`,
    uploader.cookie
  );
  const ev = ceremoniesRes.json.data?.[0];
  const amt = ev?.budgetAmount ?? ev?.budget_amount;
  const amtType = typeof amt;
  if (amtType === "string" || amtType === "number") {
    pass(`Ceremonies API returns budgetAmount as ${amtType} (${amt}) — client must coerce`);
  } else {
    fail(`Ceremonies API budgetAmount unexpected: ${amtType} ${amt}`);
  }

  if (Number(amt) === 40000) pass("Ceremony budgetAmount parses to 40000");
  else fail(`Ceremony amount parse: ${amt}`);

  await sql`DELETE FROM lead_events WHERE lead_id = ${leadId}::uuid`;
  await sql`DELETE FROM bride_leads WHERE id = ${leadId}::uuid`;
  pass("Cleaned up tier smoke lead");

  await sql.end({ timeout: 1 });
}

console.log("\n— Budget tier unit tests —\n");
await runUnitTests();

console.log("\n— Budget tier API tests —\n");
await runApiTests();

console.log(`\nBudget tier smoke: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
