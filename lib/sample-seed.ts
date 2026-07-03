import type postgres from "postgres";
import { syncMuaRegions } from "@/lib/mua-regions-db";
import {
  SAMPLE_LEAD_DISPLAY_IDS,
  SAMPLE_MUA_DISPLAY_IDS,
  SAMPLE_SOURCE_TAG,
} from "@/lib/sample-data";
import type { Region } from "@/lib/types";

export type Sql = postgres.Sql<Record<string, unknown>>;

type StaffMap = {
  kanika: string;
  rmNorth: string;
  commission: string;
  uploader: string;
  admin: string;
};

type MuaMap = Record<string, string>;

const MUAS: Array<{
  displayId: string;
  name: string;
  city: string;
  regions: Region[];
  tier: string | null;
}> = [
  { displayId: "MUA-S001", name: "Deepa Artistry", city: "Delhi", regions: ["north"], tier: "highest_privy" },
  { displayId: "MUA-S002", name: "Zara Bridal Studio", city: "Mumbai", regions: ["west"], tier: "phoenix_2" },
  { displayId: "MUA-S003", name: "Glam by Ananya", city: "Bangalore", regions: ["south"], tier: "phoenix" },
  { displayId: "MUA-S004", name: "Riya Freelance", city: "Delhi", regions: ["north"], tier: "pro" },
  { displayId: "MUA-S005", name: "Kolkata Glow", city: "Kolkata", regions: ["east"], tier: "prime" },
  { displayId: "MUA-S006", name: "Pune Brides", city: "Pune", regions: ["west"], tier: "phoenix" },
  { displayId: "MUA-S007", name: "Chennai Classics", city: "Chennai", regions: ["south"], tier: "pro" },
  { displayId: "MUA-S008", name: "Jaipur Royal", city: "Jaipur", regions: ["north"], tier: "phoenix_2" },
  { displayId: "MUA-S009", name: "Hyderabad Hue", city: "Hyderabad", regions: ["south"], tier: "highest_privy" },
  { displayId: "MUA-S010", name: "Ahmedabad Aura", city: "Ahmedabad", regions: ["west"], tier: "pro" },
  { displayId: "MUA-S011", name: "Chandigarh Chic", city: "Chandigarh", regions: ["north"], tier: "prime" },
  { displayId: "MUA-S012", name: "Kochi Kiss", city: "Kochi", regions: ["south", "west"], tier: null },
  { displayId: "MUA-S013", name: "Noida Nest", city: "Noida", regions: ["north"], tier: "phoenix" },
  { displayId: "MUA-S014", name: "Surat Sparkle", city: "Surat", regions: ["west"], tier: null },
  { displayId: "MUA-S015", name: "Patna Poise", city: "Patna", regions: ["east"], tier: "pro" },
  { displayId: "MUA-S016", name: "Multi-Region Elite", city: "Delhi", regions: ["north", "west"], tier: "highest_privy" },
];

async function loadStaff(sql: Sql): Promise<StaffMap> {
  const rows = await sql<{ email: string; id: string }[]>`
    SELECT email, id FROM staff
    WHERE email IN (
      'kanika@olready.in',
      'rm.north@olready.in',
      'commission@olready.in',
      'uploader@olready.in',
      'admin@olready.in'
    )
  `;
  const byEmail = Object.fromEntries(rows.map((r) => [r.email, r.id]));
  const missing = ["kanika@olready.in", "commission@olready.in"].filter((e) => !byEmail[e]);
  if (missing.length) {
    throw new Error(`Missing staff — run npm run db:seed first: ${missing.join(", ")}`);
  }
  return {
    kanika: byEmail["kanika@olready.in"],
    rmNorth: byEmail["rm.north@olready.in"] ?? byEmail["kanika@olready.in"],
    commission: byEmail["commission@olready.in"],
    uploader: byEmail["uploader@olready.in"] ?? byEmail["kanika@olready.in"],
    admin: byEmail["admin@olready.in"] ?? byEmail["kanika@olready.in"],
  };
}

async function seedMuas(sql: Sql): Promise<MuaMap> {
  const map: MuaMap = {};
  for (const m of MUAS) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO muas (display_id, name, city, plan_tier, status)
      VALUES (
        ${m.displayId},
        ${m.name},
        ${m.city},
        ${m.tier ? sql`${m.tier}::plan_tier` : null},
        'active'
      )
      RETURNING id
    `;
    map[m.displayId] = row.id;
    await syncMuaRegions(sql, row.id, m.regions);
  }
  return map;
}

type CeremonySeed = {
  type: string;
  days: number;
  location: string;
  region: Region;
  budget: number | null;
  status?: "open" | "booked" | "not_needed";
  bookedPrice?: number;
  muaKey?: string;
};

async function insertLead(
  sql: Sql,
  params: {
    displayId: string;
    brideName: string;
    phone: string;
    city: string;
    region: Region;
    status: string;
    verified: boolean;
    daysToEvent: number;
    tier: string;
    budget: number;
    assignedRmId?: string | null;
    assignmentDaysAgo?: number;
    shiftedDaysAgo?: number;
    handoverReason?: string | null;
    portalOnly?: boolean;
    portalPushed?: boolean;
    ceremonies: CeremonySeed[];
  }
): Promise<{ leadId: string; eventIds: Record<string, string> }> {
  const earliest = Math.min(...params.ceremonies.map((c) => c.days));
  const eventLocation = params.ceremonies.map((c) => `${c.type} — ${c.location}`).join("; ");

  const [lead] = await sql<{ id: string }[]>`
    INSERT INTO bride_leads (
      display_id, bride_name, phone, email, city, region, event_location, event_date,
      budget_tier, budget_amount, source, status, verified, verified_at,
      assigned_rm_id, assignment_date, shifted_at, handover_reason,
      portal_only, portal_pushed, group_size, group_notes
    ) VALUES (
      ${params.displayId},
      ${params.brideName},
      ${params.phone},
      ${`${params.displayId.toLowerCase()}@sample.olready.in`},
      ${params.city},
      ${params.region}::region,
      ${eventLocation},
      (CURRENT_DATE + ${earliest}::int),
      ${params.tier}::budget_tier,
      ${params.budget},
      ${SAMPLE_SOURCE_TAG},
      ${params.status}::lead_status,
      ${params.verified},
      ${params.verified ? sql`NOW()` : null},
      ${params.assignedRmId ?? null}::uuid,
      ${params.assignmentDaysAgo != null ? sql`(CURRENT_DATE - ${params.assignmentDaysAgo}::int)` : null},
      ${params.shiftedDaysAgo != null ? sql`NOW() - make_interval(days => ${params.shiftedDaysAgo})` : null},
      ${params.handoverReason ?? null},
      ${params.portalOnly ?? false},
      ${params.portalPushed ?? false},
      ${2 + (params.displayId.charCodeAt(params.displayId.length - 1) % 4)},
      ${"Sample seed — " + params.brideName}
    )
    RETURNING id
  `;

  const eventIds: Record<string, string> = {};
  for (const c of params.ceremonies) {
    const [ev] = await sql<{ id: string }[]>`
      INSERT INTO lead_events (
        lead_id, ceremony_type, event_date, event_location, region, status,
        budget_amount, mua_id, booked_price
      ) VALUES (
        ${lead.id}::uuid,
        ${c.type},
        (CURRENT_DATE + ${c.days}::int),
        ${c.location},
        ${c.region}::region,
        ${c.status ?? "open"}::event_status,
        ${c.budget},
        ${c.muaKey && params.status !== "pending_verification" ? sql`${null}::uuid` : null},
        ${c.bookedPrice ?? null}
      )
      RETURNING id
    `;
    eventIds[c.type] = ev.id;
  }

  await sql`
    INSERT INTO comms (lead_id, entry_type, description, actor_id)
    VALUES (
      ${lead.id}::uuid,
      'lead_created',
      ${"Sample lead created — " + params.displayId},
      ${params.assignedRmId ?? null}::uuid
    )
  `;

  return { leadId: lead.id, eventIds };
}

async function insertPush(
  sql: Sql,
  params: {
    leadId: string;
    muaId: string;
    pushedBy: string;
    eventIds: string[];
    prices: Record<string, number>;
    stage?: string;
    status?: string;
  }
): Promise<string> {
  const total = Object.values(params.prices).reduce((a, b) => a + b, 0);
  const [push] = await sql<{ id: string }[]>`
    INSERT INTO mua_pushes (
      lead_id, mua_id, stage, status, quoted_total, event_ids, pushed_by
    ) VALUES (
      ${params.leadId}::uuid,
      ${params.muaId}::uuid,
      ${params.stage ?? "offer_sent"}::mua_push_stage,
      ${params.status ?? "active"}::mua_push_status,
      ${total},
      ${sql.array(params.eventIds)}::uuid[],
      ${params.pushedBy}::uuid
    )
    RETURNING id
  `;
  for (const [eventId, price] of Object.entries(params.prices)) {
    await sql`
      INSERT INTO mua_push_event_prices (push_id, event_id, quoted_price)
      VALUES (${push.id}::uuid, ${eventId}::uuid, ${price})
    `;
  }
  return push.id;
}

export async function seedSampleData(sql: Sql): Promise<{
  leads: string[];
  muas: string[];
  staff: StaffMap;
}> {
  const staff = await loadStaff(sql);
  const muaIds = await seedMuas(sql);

  const tierCycle = ["tier_1", "tier_2", "tier_3", "tier_4"] as const;
  const regions: Region[] = ["north", "east", "west", "south"];
  const cities: Record<Region, string[]> = {
    north: ["Delhi", "Jaipur", "Chandigarh", "Noida"],
    east: ["Kolkata", "Patna"],
    west: ["Mumbai", "Pune", "Ahmedabad"],
    south: ["Bangalore", "Chennai", "Hyderabad"],
  };

  let phoneSeq = 9100000000;

  // —— Pending verification (5) ——
  for (let i = 0; i < 5; i++) {
    const region = regions[i % 4];
    const displayId = `LD-S${String(i + 1).padStart(3, "0")}`;
    await insertLead(sql, {
      displayId,
      brideName: `Pending Bride ${i + 1}`,
      phone: `+91${phoneSeq++}`,
      city: cities[region][0],
      region,
      status: "pending_verification",
      verified: false,
      daysToEvent: 45 + i * 10,
      tier: tierCycle[i % 4],
      budget: 40000 + i * 15000,
      ceremonies: [
        {
          type: "Wedding",
          days: 50 + i * 10,
          location: cities[region][0],
          region,
          budget: 40000,
        },
        ...(i % 2 === 0
          ? [
              {
                type: "Reception",
                days: 52 + i * 10,
                location: cities[region][0],
                region,
                budget: 25000,
              },
            ]
          : []),
      ],
    });
  }

  // —— Verified, unassigned (1) ——
  await insertLead(sql, {
    displayId: "LD-S006",
    brideName: "Verified Unassigned",
    phone: `+91${phoneSeq++}`,
    city: "Mumbai",
    region: "west",
    status: "verified",
    verified: true,
    daysToEvent: 75,
    tier: "tier_2",
    budget: 90000,
    ceremonies: [
      {
        type: "Wedding",
        days: 75,
        location: "Mumbai",
        region: "west",
        budget: 90000,
      },
    ],
  });

  // —— Hostile / archived ——
  await insertLead(sql, {
    displayId: "LD-S007",
    brideName: "Hostile Flagged",
    phone: `+91${phoneSeq++}`,
    city: "Kolkata",
    region: "east",
    status: "archived",
    verified: true,
    daysToEvent: 80,
    tier: "tier_3",
    budget: 45000,
    ceremonies: [
      {
        type: "Wedding",
        days: 80,
        location: "Kolkata",
        region: "east",
        budget: 45000,
        status: "not_needed",
      },
    ],
  });
  await sql`
    UPDATE bride_leads SET hostile_note = 'Repeated abusive calls — sample seed'
    WHERE display_id = 'LD-S007'
  `;

  // —— Assigned north RM queue (8) ——
  for (let i = 0; i < 8; i++) {
    const region = i % 2 === 0 ? "north" : "west";
    const city = cities[region][i % cities[region].length];
    const { leadId, eventIds } = await insertLead(sql, {
      displayId: `LD-S${String(8 + i).padStart(3, "0")}`,
      brideName: `Assigned Lead ${i + 1}`,
      phone: `+91${phoneSeq++}`,
      city,
      region: i % 2 === 0 ? "north" : "north",
      status: "assigned",
      verified: true,
      daysToEvent: 20 + i * 4,
      tier: tierCycle[i % 4],
      budget: 60000 + i * 8000,
      assignedRmId: i % 3 === 0 ? staff.rmNorth : staff.kanika,
      assignmentDaysAgo: 3 + (i % 10),
      ceremonies: [
        {
          type: "Haldi",
          days: 18 + i * 4,
          location: city,
          region: region,
          budget: 20000,
        },
        {
          type: "Wedding",
          days: 22 + i * 4,
          location: city,
          region: region,
          budget: 50000,
        },
      ],
    });

    if (i % 3 === 0) {
      const muaKey = region === "north" ? "MUA-S001" : "MUA-S002";
      await insertPush(sql, {
        leadId,
        muaId: muaIds[muaKey],
        pushedBy: staff.kanika,
        eventIds: [eventIds.Haldi, eventIds.Wedding].filter(Boolean),
        prices: {
          [eventIds.Haldi]: 22000,
          [eventIds.Wedding]: 55000,
        },
      });
    }
  }

  // —— Partial multi-book (Harsha-style, correct state) LD-S017 ——
  const harsha = await insertLead(sql, {
    displayId: "LD-S017",
    brideName: "Harsha Nair",
    phone: `+91${phoneSeq++}`,
    city: "Delhi",
    region: "north",
    status: "assigned",
    verified: true,
    daysToEvent: 30,
    tier: "tier_1",
    budget: 180000,
    assignedRmId: staff.rmNorth,
    assignmentDaysAgo: 8,
    ceremonies: [
      {
        type: "Mehendi",
        days: 28,
        location: "Delhi",
        region: "north",
        budget: 35000,
        status: "booked",
        bookedPrice: 32000,
      },
      {
        type: "Wedding",
        days: 32,
        location: "Delhi",
        region: "north",
        budget: 95000,
        status: "open",
      },
      {
        type: "Reception",
        days: 33,
        location: "Mumbai",
        region: "west",
        budget: 50000,
        status: "open",
      },
    ],
  });
  const harshaPush = await insertPush(sql, {
    leadId: harsha.leadId,
    muaId: muaIds["MUA-S001"],
    pushedBy: staff.rmNorth,
    eventIds: [
      harsha.eventIds.Mehendi,
      harsha.eventIds.Wedding,
      harsha.eventIds.Reception,
    ],
    prices: {
      [harsha.eventIds.Mehendi]: 32000,
      [harsha.eventIds.Wedding]: 90000,
      [harsha.eventIds.Reception]: 48000,
    },
    status: "active",
  });
  await sql`
    UPDATE lead_events SET mua_id = ${muaIds["MUA-S001"]}::uuid
    WHERE id = ${harsha.eventIds.Mehendi}::uuid
  `;
  await sql`
    INSERT INTO bookings (
      lead_id, event_id, mua_id, push_id, booked_price, advance_paid, full_paid, created_by
    ) VALUES (
      ${harsha.leadId}::uuid,
      ${harsha.eventIds.Mehendi}::uuid,
      ${muaIds["MUA-S001"]}::uuid,
      ${harshaPush}::uuid,
      32000,
      10000,
      NULL,
      ${staff.rmNorth}::uuid
    )
  `;

  // —— Commission queue (6) ——
  for (let i = 0; i < 6; i++) {
    const region = regions[i % 4];
    await insertLead(sql, {
      displayId: `LD-S${String(18 + i).padStart(3, "0")}`,
      brideName: `Commission Lead ${i + 1}`,
      phone: `+91${phoneSeq++}`,
      city: cities[region][0],
      region,
      status: "commission_rm",
      verified: true,
      daysToEvent: 40 + i * 6,
      tier: "tier_2",
      budget: 75000,
      assignedRmId: staff.kanika,
      assignmentDaysAgo: 25,
      shiftedDaysAgo: 4 + i,
      handoverReason: "Not Interested in Plan MUAs",
      ceremonies: [
        {
          type: "Wedding",
          days: 45 + i * 6,
          location: cities[region][0],
          region,
          budget: 75000,
        },
      ],
    });
  }

  // —— Fully booked (2) ——
  for (let i = 0; i < 2; i++) {
    const { leadId, eventIds } = await insertLead(sql, {
      displayId: `LD-S${String(24 + i).padStart(3, "0")}`,
      brideName: `Booked Bride ${i + 1}`,
      phone: `+91${phoneSeq++}`,
      city: "Bangalore",
      region: "south",
      status: "booked",
      verified: true,
      daysToEvent: 14 + i,
      tier: "tier_1",
      budget: 120000,
      assignedRmId: staff.kanika,
      assignmentDaysAgo: 20,
      ceremonies: [
        {
          type: "Wedding",
          days: 16 + i,
          location: "Bangalore",
          region: "south",
          budget: 120000,
          status: "booked",
          bookedPrice: 115000,
        },
      ],
    });
    const pushId = await insertPush(sql, {
      leadId,
      muaId: muaIds["MUA-S003"],
      pushedBy: staff.kanika,
      eventIds: [eventIds.Wedding],
      prices: { [eventIds.Wedding]: 115000 },
      status: "booked",
    });
    await sql`
      UPDATE lead_events SET mua_id = ${muaIds["MUA-S003"]}::uuid
      WHERE id = ${eventIds.Wedding}::uuid
    `;
    await sql`
      INSERT INTO bookings (
        lead_id, event_id, mua_id, push_id, booked_price, advance_paid, full_paid, created_by
      ) VALUES (
        ${leadId}::uuid,
        ${eventIds.Wedding}::uuid,
        ${muaIds["MUA-S003"]}::uuid,
        ${pushId}::uuid,
        115000,
        50000,
        65000,
        ${staff.kanika}::uuid
      )
    `;
  }

  // —— Archived NI (2) ——
  for (let i = 0; i < 2; i++) {
    await insertLead(sql, {
      displayId: `LD-S${String(26 + i).padStart(3, "0")}`,
      brideName: `Archived NI ${i + 1}`,
      phone: `+91${phoneSeq++}`,
      city: "Delhi",
      region: "north",
      status: "archived",
      verified: true,
      daysToEvent: 100,
      tier: "tier_3",
      budget: 50000,
      handoverReason: "Not interested — Commission closed",
      ceremonies: [
        {
          type: "Wedding",
          days: 100,
          location: "Delhi",
          region: "north",
          budget: 50000,
          status: "not_needed",
        },
      ],
    });
  }

  // —— Portal (2) ——
  for (let i = 0; i < 2; i++) {
    await insertLead(sql, {
      displayId: `LD-S${String(28 + i).padStart(3, "0")}`,
      brideName: `Portal Lead ${i + 1}`,
      phone: `+91${phoneSeq++}`,
      city: "Mumbai",
      region: "west",
      status: "verified",
      verified: true,
      daysToEvent: 55,
      tier: "tier_2",
      budget: 70000,
      portalOnly: true,
      portalPushed: i === 0,
      ceremonies: [
        {
          type: "Wedding",
          days: 60,
          location: "Mumbai",
          region: "west",
          budget: 70000,
        },
      ],
    });
  }

  // —— Expired (1) ——
  await insertLead(sql, {
    displayId: "LD-S030",
    brideName: "Expired Lead",
    phone: `+91${phoneSeq++}`,
    city: "Delhi",
    region: "north",
    status: "expired",
    verified: true,
    daysToEvent: -30,
    tier: "tier_4",
    budget: 30000,
    ceremonies: [
      {
        type: "Wedding",
        days: -25,
        location: "Delhi",
        region: "north",
        budget: 30000,
        status: "not_needed",
      },
    ],
  });
  await sql`
    UPDATE bride_leads SET expired_at = NOW() - INTERVAL '7 days'
    WHERE display_id = 'LD-S030'
  `;

  // —— Cross-region assigned (multi location) LD-S016 ——
  const cross = await insertLead(sql, {
    displayId: "LD-S016",
    brideName: "Cross Region Bride",
    phone: `+91${phoneSeq++}`,
    city: "Delhi",
    region: "north",
    status: "assigned",
    verified: true,
    daysToEvent: 35,
    tier: "tier_1",
    budget: 200000,
    assignedRmId: staff.rmNorth,
    assignmentDaysAgo: 5,
    ceremonies: [
      {
        type: "Wedding",
        days: 35,
        location: "Delhi",
        region: "north",
        budget: 120000,
      },
      {
        type: "Reception",
        days: 36,
        location: "Mumbai",
        region: "west",
        budget: 80000,
      },
    ],
  });
  await insertPush(sql, {
    leadId: cross.leadId,
    muaId: muaIds["MUA-S016"],
    pushedBy: staff.rmNorth,
    eventIds: [cross.eventIds.Wedding],
    prices: { [cross.eventIds.Wedding]: 110000 },
  });

  return {
    leads: [...SAMPLE_LEAD_DISPLAY_IDS],
    muas: [...SAMPLE_MUA_DISPLAY_IDS],
    staff,
  };
}

export async function cleanSampleData(sql: Sql): Promise<{
  leadsRemoved: number;
  muasRemoved: number;
}> {
  const leadIds = await sql<{ id: string }[]>`
    SELECT id FROM bride_leads
    WHERE source = ${SAMPLE_SOURCE_TAG}
       OR display_id = ANY(${sql.array([...SAMPLE_LEAD_DISPLAY_IDS])})
  `;
  const ids = leadIds.map((r) => r.id);

  if (ids.length > 0) {
    await sql`DELETE FROM bookings WHERE lead_id = ANY(${sql.array(ids)}::uuid[])`;
    await sql`DELETE FROM rm_tasks WHERE lead_id = ANY(${sql.array(ids)}::uuid[])`;
    await sql`DELETE FROM bride_leads WHERE id = ANY(${sql.array(ids)}::uuid[])`;
  }

  const removedMuas = await sql<{ count: number }[]>`
    WITH deleted AS (
      DELETE FROM muas
      WHERE display_id = ANY(${sql.array([...SAMPLE_MUA_DISPLAY_IDS])})
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `;

  return {
    leadsRemoved: ids.length,
    muasRemoved: removedMuas[0]?.count ?? 0,
  };
}
