import { syncMuaRegions } from "@/lib/mua-regions-db";
import type { Region } from "@/lib/types";
import type postgres from "postgres";

export type Sql = postgres.Sql<Record<string, unknown>>;

export const FRESH_SOURCE_TAG = "fresh_seed";

const CITIES: { city: string; region: Region }[] = [
  { city: "Delhi", region: "north" },
  { city: "Mumbai", region: "west" },
  { city: "Bangalore", region: "south" },
  { city: "Kolkata", region: "east" },
  { city: "Jaipur", region: "north" },
  { city: "Pune", region: "west" },
  { city: "Chennai", region: "south" },
  { city: "Hyderabad", region: "south" },
  { city: "Ahmedabad", region: "west" },
  { city: "Chandigarh", region: "north" },
];

const PLAN_TIERS = ["highest_privy", "phoenix_2", "phoenix", "pro", "prime"] as const;
const BUDGET_TIERS = ["tier_1", "tier_2", "tier_3", "tier_4"] as const;
const CEREMONIES = ["Wedding", "Haldi", "Reception", "Engagement"] as const;

const MUA_NAMES = [
  "Ananya Glam",
  "Priya Bridal",
  "Meera Makeovers",
  "Kavya Studio",
  "Ishita Artistry",
  "Sneha Faces",
  "Divya Dolls",
  "Rhea Radiance",
  "Tara Touch",
  "Nisha Nectar",
  "Pooja Polish",
  "Lakshmi Looks",
  "Aditi Aura",
  "Simran Shine",
  "Neha Nest",
  "Zara Zone",
  "Kiara Kiss",
  "Maya Muse",
  "Sana Spark",
  "Aisha Allure",
];

export async function seedFreshData(sql: Sql): Promise<{
  leads: number;
  muas: number;
  pendingLeads: number;
  expiredMuas: number;
  noPlanHistoryMuas: number;
}> {
  const [uploader] = await sql<{ id: string }[]>`
    SELECT id FROM staff WHERE email = 'uploader@olready.in' AND active = true LIMIT 1
  `;
  const [admin] = await sql<{ id: string }[]>`
    SELECT id FROM staff WHERE email = 'admin@olready.in' AND active = true LIMIT 1
  `;
  const actorId = uploader?.id ?? admin?.id ?? null;

  // —— 50 pre-verification leads ——
  for (let i = 1; i <= 50; i++) {
    const displayId = `LD-${String(i).padStart(5, "0")}`;
    const loc = CITIES[i % CITIES.length]!;
    const tier = BUDGET_TIERS[i % BUDGET_TIERS.length]!;
    const budget = 40000 + (i % 8) * 15000;
    const daysToEvent = 30 + (i % 120);
    const ceremony = CEREMONIES[i % CEREMONIES.length]!;

    const [lead] = await sql<{ id: string }[]>`
      INSERT INTO bride_leads (
        display_id, bride_name, phone, email, city, region, event_date,
        budget_tier, budget_amount, source, status, verified, group_size
      ) VALUES (
        ${displayId},
        ${`Bride ${String(i).padStart(2, "0")}`},
        ${`+9199${String(1000000 + i).slice(-7)}`},
        ${`bride${i}@fresh.olready.in`},
        ${loc.city},
        ${loc.region}::region,
        CURRENT_DATE + ${daysToEvent}::int,
        ${tier}::budget_tier,
        ${budget},
        ${FRESH_SOURCE_TAG},
        'pending_verification'::lead_status,
        false,
        ${2 + (i % 3)}
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO lead_events (lead_id, ceremony_type, event_date, event_location, region, status, budget_amount)
      VALUES (
        ${lead.id}::uuid,
        ${ceremony},
        CURRENT_DATE + ${daysToEvent}::int,
        ${loc.city},
        ${loc.region}::region,
        'open'::event_status,
        ${budget}
      )
    `;

    if (actorId) {
      await sql`
        INSERT INTO comms (lead_id, entry_type, description, actor_id)
        VALUES (
          ${lead.id}::uuid,
          'lead_created',
          ${'Fresh seed lead — ' + displayId},
          ${actorId}::uuid
        )
      `;
    }
  }

  // —— 20 MUAs: 10 expired plan, 10 no plan history ——
  let expiredCount = 0;
  let noHistoryCount = 0;

  for (let i = 1; i <= 20; i++) {
    const displayId = `MUA-${String(i).padStart(4, "0")}`;
    const loc = CITIES[i % CITIES.length]!;
    const name = MUA_NAMES[i - 1] ?? `MUA ${i}`;
    const isExpired = i <= 10;

    if (isExpired) {
      const tier = PLAN_TIERS[i % PLAN_TIERS.length]!;
      const expiryDaysAgo = 15 + (i % 60);
      const assignedDaysAgo = 400;
      const [mua] = await sql<{ id: string }[]>`
        INSERT INTO muas (
          display_id, name, city, plan_tier, plan_expiry, status, phone, source, join_date
        ) VALUES (
          ${displayId},
          ${name},
          ${loc.city},
          ${tier}::plan_tier,
          CURRENT_DATE - ${expiryDaysAgo}::int,
          're_engage',
          ${`+9198${String(2000000 + i).slice(-7)}`},
          'Others',
          CURRENT_DATE - ${assignedDaysAgo}::int
        )
        RETURNING id
      `;
      await syncMuaRegions(sql, mua.id, [loc.region]);
      await sql`
        INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_by, assigned_at, expiry_at, notes)
        VALUES (
          ${mua.id}::uuid,
          ${tier}::plan_tier,
          ${actorId}::uuid,
          NOW() - make_interval(days => ${assignedDaysAgo}),
          CURRENT_DATE - ${expiryDaysAgo}::int,
          'Fresh seed — expired plan'
        )
      `;
      expiredCount++;
    } else {
      const [mua] = await sql<{ id: string }[]>`
        INSERT INTO muas (
          display_id, name, city, plan_tier, plan_expiry, status, phone, source, join_date
        ) VALUES (
          ${displayId},
          ${name},
          ${loc.city},
          NULL,
          NULL,
          ${i % 3 === 0 ? "candidate" : "active"},
          ${`+9198${String(3000000 + i).slice(-7)}`},
          'Others',
          CURRENT_DATE - ${30 + i}::int
        )
        RETURNING id
      `;
      await syncMuaRegions(sql, mua.id, [loc.region]);
      noHistoryCount++;
    }
  }

  const [counts] = await sql<
    { leads: number; muas: number; pending: number; expired: number; noHist: number }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads WHERE source = ${FRESH_SOURCE_TAG}) AS leads,
      (SELECT COUNT(*)::int FROM muas WHERE display_id LIKE 'MUA-%') AS muas,
      (SELECT COUNT(*)::int FROM bride_leads WHERE source = ${FRESH_SOURCE_TAG} AND status = 'pending_verification') AS pending,
      (SELECT COUNT(*)::int FROM muas m
        WHERE m.display_id LIKE 'MUA-%'
          AND m.plan_expiry IS NOT NULL
          AND m.plan_expiry < CURRENT_DATE) AS expired,
      (SELECT COUNT(*)::int FROM muas m
        WHERE m.display_id LIKE 'MUA-%'
          AND NOT EXISTS (SELECT 1 FROM mua_plan_history h WHERE h.mua_id = m.id)) AS "noHist"
  `;

  return {
    leads: counts?.leads ?? 50,
    muas: counts?.muas ?? 20,
    pendingLeads: counts?.pending ?? 0,
    expiredMuas: counts?.expired ?? expiredCount,
    noPlanHistoryMuas: counts?.noHist ?? noHistoryCount,
  };
}
