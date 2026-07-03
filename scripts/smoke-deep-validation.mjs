#!/usr/bin/env node
/**
 * Deep validation: DB invariants + write flows (ceremony regions, booking, NI, plans).
 * Usage: node scripts/smoke-deep-validation.mjs [baseUrl]
 *
 * Creates a disposable lead tagged DeepTest / phone 88888* and deletes it on success.
 */
import { SMOKE_USERS, SMOKE_PASSWORD } from "./smoke-env.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const strictLegacy = process.argv.includes("--strict");

let failed = 0;
let passed = 0;
const warnings = [];

function pass(msg) {
  passed++;
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  failed++;
  console.log(`✗ ${msg}`);
}
function warn(msg) {
  warnings.push(msg);
  console.log(`⚠ ${msg}`);
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
  return { cookie, userId: json.data?.user?.id ?? null };
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

async function withDb(fn) {
  const url = dbUrl();
  if (!url) return null;
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, {
    transform: postgres.camel,
    ssl: url.includes("supabase.co") ? "require" : false,
    max: 1,
    idle_timeout: 5,
  });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 3 });
  }
}

async function runDbInvariants() {
  console.log("\n── DB invariants ──\n");
  const r = await withDb(async (sql) => {
    const badBookedPushes = await sql`
      SELECT mp.id, mp.status, mp.lead_id AS "leadId"
      FROM mua_pushes mp
      WHERE mp.status = 'booked'
        AND EXISTS (
          SELECT 1
          FROM unnest(mp.event_ids) AS eid(id)
          JOIN lead_events le ON le.id = eid.id
          WHERE le.status NOT IN ('booked', 'not_needed')
        )
      LIMIT 10
    `;
    const badBookedLeads = await sql`
      SELECT bl.id, bl.display_id AS "displayId", bl.bride_name AS "brideName"
      FROM bride_leads bl
      WHERE bl.status = 'booked'
        AND EXISTS (
          SELECT 1 FROM lead_events le
          WHERE le.lead_id = bl.id AND le.status = 'open'
        )
      LIMIT 10
    `;
    const badAwaitingClose = await sql`
      SELECT mp.id, mp.lead_id AS "leadId", mp.status
      FROM mua_pushes mp
      WHERE mp.status = 'awaiting_close'
        AND EXISTS (
          SELECT 1 FROM lead_events le
          WHERE le.lead_id = mp.lead_id AND le.status = 'open'
        )
      LIMIT 10
    `;
    const verifiedMissingRegion = await sql`
      SELECT le.id, le.ceremony_type AS "ceremonyType"
      FROM lead_events le
      JOIN bride_leads bl ON bl.id = le.lead_id
      WHERE bl.verified = true
        AND bl.status NOT IN ('pending_verification', 'archived', 'missed')
        AND le.region IS NULL
        AND le.status != 'not_needed'
      LIMIT 10
    `;
    const staleCommissionArchived = await sql`
      SELECT bl.id, bl.display_id AS "displayId"
      FROM bride_leads bl
      WHERE bl.status = 'commission_rm'
        AND bl.handover_reason ILIKE '%archived%'
      LIMIT 5
    `;
    const harsha = await sql`
      SELECT bl.id, bl.display_id AS "displayId", bl.status,
        (
          SELECT json_agg(json_build_object(
            'pushId', mp.id,
            'status', mp.status,
            'nEvents', cardinality(mp.event_ids),
            'openOnPush', (
              SELECT COUNT(*)::int
              FROM unnest(mp.event_ids) eid(id)
              JOIN lead_events le ON le.id = eid.id
              WHERE le.status NOT IN ('booked', 'not_needed')
            )
          ))
          FROM mua_pushes mp WHERE mp.lead_id = bl.id
        ) AS pushes
      FROM bride_leads bl
      WHERE lower(bl.bride_name) LIKE '%harsha%'
      LIMIT 3
    `;
    const multiPartial = await sql`
      SELECT bl.id, bl.display_id AS "displayId", bl.status,
        (SELECT COUNT(*)::int FROM lead_events le WHERE le.lead_id = bl.id AND le.status = 'booked') AS booked,
        (SELECT COUNT(*)::int FROM lead_events le WHERE le.lead_id = bl.id AND le.status = 'open') AS open_ev,
        (
          SELECT COUNT(*)::int FROM mua_pushes mp
          WHERE mp.lead_id = bl.id AND mp.status = 'active'
            AND cardinality(mp.event_ids) > 1
        ) AS multi_active_pushes
      FROM bride_leads bl
      WHERE (
        SELECT COUNT(*) FROM lead_events le
        WHERE le.lead_id = bl.id AND le.status = 'booked'
      ) > 0
      AND (
        SELECT COUNT(*) FROM lead_events le
        WHERE le.lead_id = bl.id AND le.status = 'open'
      ) > 0
      LIMIT 5
    `;
    return {
      badBookedPushes,
      badBookedLeads,
      badAwaitingClose,
      verifiedMissingRegion,
      staleCommissionArchived,
      harsha,
      multiPartial,
    };
  });

  if (!r) {
    warn("DATABASE_URL not set — skipping DB invariant checks");
    return;
  }

  const legacyMsg = (label, rows) => {
    if (rows.length === 0) {
      pass(label);
      return;
    }
    const detail = rows
      .slice(0, 3)
      .map((x) => x.displayId ?? x.id?.slice?.(0, 8) ?? x.id)
      .join(", ");
    if (strictLegacy) fail(`${label}: ${rows.length} (${detail})`);
    else warn(`${label}: ${rows.length} legacy row(s) — ${detail} (pre–multi-book fix)`);
  };

  legacyMsg("No push is `booked` while it still has open ceremonies", r.badBookedPushes);
  legacyMsg("No lead is `booked` while ceremonies remain open", r.badBookedLeads);
  legacyMsg("No `awaiting_close` push on leads with open ceremonies", r.badAwaitingClose);

  if (r.verifiedMissingRegion.length === 0) pass("Verified ceremonies have region set");
  else
    warn(
      `${r.verifiedMissingRegion.length} verified ceremony row(s) missing region (legacy data?)`
    );

  if (r.staleCommissionArchived.length === 0) pass("No commission_rm rows with archived handover text");
  else fail(`stale commission_rm rows: ${r.staleCommissionArchived.length}`);

  if (r.harsha.length) {
    for (const h of r.harsha) {
      const stuck = (h.pushes ?? []).filter(
        (p) =>
          p.status === "awaiting_close" &&
          (p.openOnPush ?? 0) > 0
      );
      if (stuck.length) {
        warn(
          `Harsha ${h.displayId}: ${stuck.length} push(es) awaiting_close with open ceremonies — may need data repair`
        );
      } else {
        pass(`Harsha ${h.displayId}: no stuck awaiting_close pushes`);
      }
    }
  } else {
    pass("No Harsha lead in DB (skip Harsha check)");
  }

  if (r.multiPartial.length > 0) {
    pass(
      `Found ${r.multiPartial.length} partial-booking lead(s) in DB for live booking test reference`
    );
  }
}

async function cleanupLead(sql, leadId) {
  if (!leadId || !sql) return;
  await sql`DELETE FROM bookings WHERE lead_id = ${leadId}::uuid`;
  await sql`DELETE FROM mua_push_event_prices WHERE push_id IN (SELECT id FROM mua_pushes WHERE lead_id = ${leadId}::uuid)`;
  await sql`DELETE FROM rm_tasks WHERE lead_id = ${leadId}::uuid`;
  await sql`DELETE FROM notifications WHERE link LIKE ${"%" + leadId + "%"}`;
  await sql`DELETE FROM mua_pushes WHERE lead_id = ${leadId}::uuid`;
  await sql`DELETE FROM comms WHERE lead_id = ${leadId}::uuid`;
  await sql`DELETE FROM lead_events WHERE lead_id = ${leadId}::uuid`;
  await sql`DELETE FROM bride_leads WHERE id = ${leadId}::uuid`;
}

async function runWriteFlows() {
  console.log("\n── Write flows (disposable DeepTest lead) ──\n");

  const stamp = Date.now().toString().slice(-7);
  const phone = `88888${stamp}`;
  const future1 = "2026-10-15";
  const future2 = "2026-11-20";

  let uploader;
  let admin;
  let rm;
  let commission;
  try {
    uploader = await login(SMOKE_USERS.uploader);
    admin = await login(SMOKE_USERS.admin);
    rm = await login(SMOKE_USERS.rm);
    commission = await login(SMOKE_USERS.commission);
  } catch (e) {
    fail(`login: ${e.message}`);
    return;
  }

  let leadId = null;
  let bookingId = null;
  let testMuaId = null;
  let savedPlan = null;

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

  try {
    // Create pending lead
    const create = await api("POST", "/api/upload/leads/create", uploader.cookie, {
      brideName: `DeepTest ${stamp}`,
      phone,
      email: `deeptest${stamp}@example.com`,
      city: "Delhi",
      region: "north",
      budgetTier: "tier2",
      source: "Smoke test",
      ceremonies: [
        { name: "Wedding", budget: 80000, date: future1, description: "North ceremony" },
        { name: "Reception", budget: 50000, date: future2, description: "West ceremony" },
      ],
    });
    if (!create.res.ok || create.json.error) {
      fail(`create lead: ${create.json.error ?? create.res.status}`);
      return;
    }
    leadId =
      create.json.data?.lead?.id ??
      create.json.data?.id ??
      create.json.data?.leadId;
    if (!leadId) {
      fail("create lead: missing id in response");
      return;
    }
    pass(`Created pending lead ${leadId.slice(0, 8)}…`);

    // Verify: multi-region without assignmentRegion → 400
    const badVerify = await api(
      "POST",
      `/api/upload/leads/${leadId}/verify`,
      uploader.cookie,
      {
        verifiedViaCall: true,
        talkedTo: "bride",
        ceremonies: [
          { name: "Wedding", budget: 80000, date: future1, location: "Delhi" },
          { name: "Reception", budget: 50000, date: future2, location: "Mumbai" },
        ],
      }
    );
    if (
      badVerify.res.status === 400 &&
      String(badVerify.json.error ?? "").includes("multiple regions")
    ) {
      pass("Verify rejects multi-region without assignmentRegion");
    } else {
      fail(
        `Expected multi-region error, got ${badVerify.res.status}: ${badVerify.json.error}`
      );
    }

    // Verify with assignmentRegion north
    const goodVerify = await api(
      "POST",
      `/api/upload/leads/${leadId}/verify`,
      uploader.cookie,
      {
        verifiedViaCall: true,
        talkedTo: "bride",
        assignmentRegion: "north",
        ceremonies: [
          { name: "Wedding", budget: 80000, date: future1, location: "Delhi" },
          { name: "Reception", budget: 50000, date: future2, location: "Mumbai" },
        ],
      }
    );
    if (!goodVerify.res.ok || goodVerify.json.error) {
      fail(`verify: ${goodVerify.json.error ?? goodVerify.res.status}`);
      return;
    }
    pass("Verified with cross-region ceremonies + main region north");

    const ceremoniesRes = await api(
      "GET",
      `/api/upload/leads/${leadId}/ceremonies`,
      uploader.cookie
    );
    const events = ceremoniesRes.json.data ?? [];
    if (events.length < 2) {
      fail(`expected 2 ceremonies, got ${events.length}`);
      return;
    }
    const northEv = events.find(
      (e) =>
        (e.region ?? e.Region) === "north" ||
        String(e.ceremonyType ?? e.ceremony_type).toLowerCase().includes("wedding")
    );
    const westEv = events.find(
      (e) =>
        (e.region ?? e.Region) === "west" ||
        String(e.ceremonyType ?? e.ceremony_type).toLowerCase().includes("reception")
    );
    if (!northEv || !westEv) {
      fail(
        `ceremony regions: ${events.map((e) => `${e.ceremonyType ?? e.ceremony_type}:${e.region}`).join(", ")}`
      );
    } else {
      pass("Ceremonies stored with north + west regions");
    }

    if (sql) {
      const [bl] = await sql`
        SELECT region::text AS region, status::text AS status, assigned_rm_id AS "assignedRmId"
        FROM bride_leads WHERE id = ${leadId}::uuid
      `;
      if (bl?.region === "north") pass("Lead-level region = assignment region (north)");
      else fail(`Lead region expected north, got ${bl?.region}`);

      if (bl?.status === "assigned" && bl?.assignedRmId) {
        pass("Lead auto-assigned to RM after verify");
      } else {
        warn(`Lead status=${bl?.status} — assign manually for booking test`);
        const northRm = await sql`
          SELECT id FROM staff WHERE role = 'regional_rm' AND region = 'north' AND active LIMIT 1
        `;
        if (northRm[0]?.id) {
          await api("POST", "/api/admin/leads/reassign", admin.cookie, {
            leadId,
            target: "rm",
            rmId: northRm[0].id,
          });
        }
      }
    }

    // MUA filter by ceremony region
    const evNorth = northEv?.id ?? events[0].id;
    const evWest = westEv?.id ?? events[1].id;
    const muasNorth = await api(
      "GET",
      `/api/muas/available?leadId=${leadId}&eventIds=${evNorth}`,
      rm.cookie
    );
    const muasWest = await api(
      "GET",
      `/api/muas/available?leadId=${leadId}&eventIds=${evWest}`,
      rm.cookie
    );
    if (muasNorth.json.error || muasWest.json.error) {
      fail(`muas/available: ${muasNorth.json.error ?? muasWest.json.error}`);
    } else {
      const northIds = new Set((muasNorth.json.data ?? []).map((m) => m.id));
      const westIds = new Set((muasWest.json.data ?? []).map((m) => m.id));
      if (northIds.size === 0 || westIds.size === 0) {
        warn("MUA lists empty for region filter — cap or seed data");
      } else {
        const onlyWest = [...westIds].filter((id) => !northIds.has(id));
        const onlyNorth = [...northIds].filter((id) => !westIds.has(id));
        if (onlyWest.length > 0 || onlyNorth.length > 0) {
          pass(
            `MUA lists differ by ceremony region (north=${northIds.size}, west=${westIds.size})`
          );
        } else {
          warn("MUA lists identical — all MUAs may cover both regions");
        }
      }
    }

    const multiRegion = await api(
      "GET",
      `/api/muas/available?leadId=${leadId}&eventIds=${evNorth},${evWest}`,
      rm.cookie
    );
    if (multiRegion.res.status === 400) {
      pass("muas/available rejects multiple regions in one request");
    } else {
      fail("expected 400 for multi-region eventIds");
    }

    // Ensure rm.north owns lead for push/book (auto-assign may pick another north RM)
    if (sql) {
      const [northRm] = await sql`
        SELECT id FROM staff WHERE email = ${SMOKE_USERS.rm} AND active LIMIT 1
      `;
      if (northRm?.id) {
        await api("POST", "/api/admin/leads/reassign", admin.cookie, {
          leadId,
          target: "rm",
          rmId: northRm.id,
        });
        rm.cookie = (await login(SMOKE_USERS.rm)).cookie;
        pass("Reassigned DeepTest lead to rm.north for booking test");
      }
    }

    // Push + partial book
    const leadDetail = await api("GET", `/api/leads/${leadId}`, rm.cookie);
    const urgency = leadDetail.json.data?.urgencyBand ?? "active";
    const muaList = muasNorth.json.data ?? [];
    if (!muaList.length) {
      warn("Skipping push/book — no MUAs available");
    } else {
      const muaId = muaList[0].id;
      const eventIds = events.map((e) => e.id);
      const prices = Object.fromEntries(eventIds.map((id) => [id, 25000]));
      const pushRes = await api("POST", `/api/leads/${leadId}/pushes`, rm.cookie, {
        muaId,
        eventIds,
        prices,
        urgencyBand: urgency,
      });
      if (!pushRes.res.ok || pushRes.json.error) {
        fail(`create push: ${pushRes.json.error ?? pushRes.res.status}`);
      } else {
        const pushId = pushRes.json.data?.id;
        pass(`Multi-event push created (${eventIds.length} ceremonies)`);

        const bookRes = await api("POST", `/api/leads/${leadId}/book`, rm.cookie, {
          eventId: eventIds[0],
          pushId,
          bookedPrice: 25000,
          advancePaid: 5000,
          fullPaid: null,
        });
        if (!bookRes.res.ok || bookRes.json.error) {
          fail(`book first ceremony: ${bookRes.json.error}`);
        } else {
          pass("Booked first ceremony with advance (partial multi-event)");

          if (sql) {
            const [pushRow] = await sql`
              SELECT status::text AS status FROM mua_pushes WHERE id = ${pushId}::uuid
            `;
            const [leadRow] = await sql`
              SELECT status::text AS status FROM bride_leads WHERE id = ${leadId}::uuid
            `;
            const openN = await sql`
              SELECT COUNT(*)::int AS n FROM lead_events
              WHERE lead_id = ${leadId}::uuid AND status = 'open'
            `;
            const [booking] = await sql`
              SELECT advance_paid AS "advancePaid", full_paid AS "fullPaid"
              FROM bookings WHERE lead_id = ${leadId}::uuid
              ORDER BY created_at DESC LIMIT 1
            `;
            bookingId = (
              await sql`SELECT id FROM bookings WHERE lead_id = ${leadId}::uuid ORDER BY created_at DESC LIMIT 1`
            )[0]?.id;

            if (pushRow?.status === "active") {
              pass("Winning push stays active after partial booking");
            } else {
              fail(`Expected push active, got ${pushRow?.status}`);
            }
            if (leadRow?.status !== "booked" && (openN[0]?.n ?? 0) > 0) {
              pass("Lead stays non-booked while ceremonies remain open");
            } else if (leadRow?.status === "booked") {
              fail("Lead marked booked with open ceremonies");
            }
            if (Number(booking?.advancePaid) === 5000) {
              pass("Booking row stores advance_paid");
            } else {
              fail(`advance_paid mismatch: ${booking?.advancePaid}`);
            }
          }

          // Competitor push on same ceremony, then book → competitor adjusted
          const mua2 = muaList[1]?.id ?? muaList[0].id;
          if (mua2 !== muaId) {
            const compPush = await api("POST", `/api/leads/${leadId}/pushes`, rm.cookie, {
              muaId: mua2,
              eventIds: [eventIds[0]],
              prices: { [eventIds[0]]: 24000 },
              urgencyBand: urgency,
            });
            const compPushId = compPush.json.data?.id;
            if (compPushId && sql) {
              const before = await sql`
                SELECT status::text AS status, event_ids AS "eventIds"
                FROM mua_pushes WHERE id = ${compPushId}::uuid
              `;
              if (before[0]) {
                pass("Competitor push created for same ceremony");
              }
            }
          }
        }
      }
    }

    // Commission NI removes from queue (after booking tests)
    let commissionRmId = commission.userId ?? null;
    if (!commissionRmId && sql) {
      const [staffRow] = await sql`
        SELECT id FROM staff WHERE email = ${SMOKE_USERS.commission} AND active LIMIT 1
      `;
      commissionRmId = staffRow?.id ?? null;
    }
    const toCommission = await api("POST", "/api/admin/leads/reassign", admin.cookie, {
      leadId,
      target: "commission",
      commissionRmId,
    });
    if (!toCommission.res.ok) {
      fail(`reassign to commission: ${toCommission.json.error}`);
    } else {
      const qBefore = await api(
        "GET",
        "/api/leads/queue?status=commission_rm&page=1&pageSize=100",
        commission.cookie
      );
      const inQueueBefore = (qBefore.json.data?.data ?? []).some((l) => l.id === leadId);
      if (inQueueBefore) pass("Lead visible in commission queue before NI");

      const ni = await api("PATCH", `/api/leads/${leadId}`, commission.cookie, {
        action: "not_interested",
      });
      if (!ni.res.ok || ni.json.error) {
        fail(`commission NI: ${ni.json.error}`);
      } else {
        const qAfter = await api(
          "GET",
          "/api/leads/queue?status=commission_rm&page=1&pageSize=100",
          commission.cookie
        );
        const inQueueAfter = (qAfter.json.data?.data ?? []).some((l) => l.id === leadId);
        if (!inQueueAfter) pass("Commission NI archives lead — removed from queue");
        else fail("Lead still in commission queue after NI");

        if (sql) {
          const [row] = await sql`
            SELECT status::text AS status FROM bride_leads WHERE id = ${leadId}::uuid
          `;
          if (row?.status === "archived") pass("Lead status is archived after commission NI");
          else fail(`Expected archived, got ${row?.status}`);
        }
      }
    }

    // Plan assign round-trip (admin) on first MUA
    const muasAdmin = await api("GET", "/api/admin/muas?page=1&pageSize=5", admin.cookie);
    const muaRow = muasAdmin.json.data?.data?.[0] ?? muasAdmin.json.data?.[0];
    if (muaRow?.id) {
      testMuaId = muaRow.id;
      savedPlan = { planTier: muaRow.planTier ?? null, planExpiry: muaRow.planExpiry ?? null };
      const patch1 = await api("PATCH", `/api/admin/muas/${testMuaId}`, admin.cookie, {
        planTier: "highestPrivy",
        planExpiry: "2027-12-31",
        note: "deep validation",
      });
      if (!patch1.res.ok) fail(`plan PATCH: ${patch1.json.error}`);
      else {
        const tier = patch1.json.data?.planTier;
        if (tier === "highestPrivy") pass("Single MUA plan → highestPrivy");
        else fail(`plan tier after PATCH: ${tier}`);
      }

      const bulk = await api("PATCH", "/api/admin/muas/bulk-plan", admin.cookie, {
        muaIds: [testMuaId],
        planTier: "pro",
        planExpiry: "2027-06-30",
      });
      if (bulk.res.ok && bulk.json.data?.updated === 1) {
        pass("Bulk plan update applied");
      } else {
        fail(`bulk plan: ${bulk.json.error}`);
      }
    } else {
      warn("Skipping plan tests — no MUA in admin list");
    }

    // Config fields
    const cfg = await api("GET", "/api/admin/config", admin.cookie);
    const sla = cfg.json.data?.sla ?? {};
    if (
      sla.budgetTierRanges &&
      typeof sla.budgetTierRanges === "object" &&
      sla.budgetTierLimits?.tier1?.max === 25000 &&
      sla.budgetTierLimits?.tier4?.min === 100001 &&
      Array.isArray(sla.leadSources)
    ) {
      pass("Admin config exposes budget tier limits + ranges + leadSources");
    } else {
      fail("Admin config missing budgetTierLimits/ranges or leadSources");
    }

    const uploadCfg = await api("GET", "/api/upload/config", uploader.cookie);
    if (uploadCfg.json.data?.budgetTierLimits?.tier2?.min === 25001) {
      pass("Upload config exposes budgetTierLimits for client preview");
    } else {
      fail("Upload config missing budgetTierLimits");
    }

    if (sql && leadId) {
      const [tierRow] = await sql`
        SELECT budget_tier::text AS tier, budget_amount AS amount
        FROM bride_leads WHERE id = ${leadId}::uuid
      `;
      if (tierRow?.tier === "tier_4" && Number(tierRow.amount) === 130000) {
        pass("Verify auto-set tier_4 from ceremony budgets (80k+50k)");
      } else {
        fail(
          `Expected tier_4 / 130000 after verify, got ${tierRow?.tier} / ${tierRow?.amount}`
        );
      }
    }
  } finally {
    if (bookingId) {
      await api("DELETE", `/api/bookings/${bookingId}`, rm.cookie).catch(() => {});
    }
    if (testMuaId && savedPlan) {
      await api("PATCH", `/api/admin/muas/${testMuaId}`, admin.cookie, {
        planTier: savedPlan.planTier,
        planExpiry: savedPlan.planExpiry,
      }).catch(() => {});
    }
    if (leadId && sql) {
      try {
        await cleanupLead(sql, leadId);
        pass(`Cleaned up DeepTest lead ${leadId.slice(0, 8)}…`);
      } catch (e) {
        fail(`cleanup: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (sql) await sql.end({ timeout: 3 });
  }
}

async function main() {
  console.log(`Deep validation @ ${base}\n`);
  try {
    const health = await fetch(`${base}/api/cities`);
    if (!health.ok) throw new Error(`Server not reachable (${health.status})`);
  } catch (e) {
    console.error(`Cannot reach ${base}: ${e.message}`);
    console.error("Start dev server: npm run dev");
    process.exit(1);
  }

  await runDbInvariants();
  await runWriteFlows();

  console.log(`\n── Summary ──`);
  console.log(`Passed: ${passed}`);
  if (warnings.length) {
    console.log(`Warnings: ${warnings.length}`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  if (failed) {
    console.log(`Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\nDeep validation passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
