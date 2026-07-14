import type postgres from "postgres";
import {
  FEEDBACK_SEED_LEAD_DISPLAY_IDS,
  FEEDBACK_SEED_SOURCE_TAG,
} from "@/lib/feedback-seed-data";

export type Sql = postgres.Sql<Record<string, unknown>>;

export async function cleanFeedbackSeedData(sql: Sql): Promise<{ leadsRemoved: number }> {
  const leadIds = await sql<{ id: string }[]>`
    SELECT id FROM bride_leads
    WHERE source = ${FEEDBACK_SEED_SOURCE_TAG}
       OR display_id = ANY(${sql.array([...FEEDBACK_SEED_LEAD_DISPLAY_IDS])})
  `;
  const ids = leadIds.map((r) => r.id);
  if (ids.length === 0) return { leadsRemoved: 0 };

  await sql`DELETE FROM bride_leads WHERE id = ANY(${sql.array(ids)}::uuid[])`;
  return { leadsRemoved: ids.length };
}

async function resolveActorId(sql: Sql): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM staff
    WHERE email IN ('kanika@olready.in', 'feedback@olready.in', 'admin@olready.in')
      AND active = true
    ORDER BY CASE email
      WHEN 'kanika@olready.in' THEN 0
      WHEN 'feedback@olready.in' THEN 1
      ELSE 2
    END
    LIMIT 1
  `;
  if (!row?.id) {
    throw new Error("No staff found — run npm run db:seed first");
  }
  return row.id;
}

async function resolveMuaId(sql: Sql, displayId: string, fallback: {
  name: string;
  city: string;
  tier: string;
  phone: string;
}): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM muas WHERE display_id = ${displayId} LIMIT 1
  `;
  if (existing?.id) return existing.id;

  const [created] = await sql<{ id: string }[]>`
    INSERT INTO muas (display_id, name, city, plan_tier, status, phone, source)
    VALUES (
      ${displayId},
      ${fallback.name},
      ${fallback.city},
      ${fallback.tier}::plan_tier,
      'active',
      ${fallback.phone},
      ${FEEDBACK_SEED_SOURCE_TAG}
    )
    RETURNING id
  `;
  return created!.id;
}

export async function seedFeedbackData(sql: Sql): Promise<{
  leads: { displayId: string; brideName: string; scenario: string }[];
}> {
  const actorId = await resolveActorId(sql);
  await cleanFeedbackSeedData(sql);

  const muaBookedId = await resolveMuaId(sql, "MUA-0001", {
    name: "Deepa Artistry",
    city: "Delhi",
    tier: "highest_privy",
    phone: "9810011111",
  });
  const muaPushedAId = await resolveMuaId(sql, "MUA-0002", {
    name: "Zara Bridal",
    city: "Mumbai",
    tier: "phoenix_2",
    phone: "9820022222",
  });
  const muaPushedBId = await resolveMuaId(sql, "MUA-0003", {
    name: "Glam Studio",
    city: "Bangalore",
    tier: "phoenix",
    phone: "9830033333",
  });

  // —— LD-FB001: booked via Olready, ceremonies past, no feedback yet ——
  const [leadBooked] = await sql<{ id: string }[]>`
    INSERT INTO bride_leads (
      display_id, bride_name, phone, email, city, region, event_date, event_location,
      budget_tier, budget_amount, source, status, verified, verified_at,
      assigned_rm_id, assignment_date, group_size, group_notes
    ) VALUES (
      'LD-FB001',
      'Sana Test',
      '+919900000101',
      'sana.feedback@test.olready.in',
      'Delhi',
      'north'::region,
      CURRENT_DATE - 18,
      'Wedding — Delhi',
      'tier_1'::budget_tier,
      95000,
      ${FEEDBACK_SEED_SOURCE_TAG},
      'booked'::lead_status,
      true,
      NOW() - INTERVAL '45 days',
      ${actorId}::uuid,
      CURRENT_DATE - 40,
      2,
      'Feedback seed — booked with Olready MUA'
    )
    RETURNING id
  `;

  const [weddingEvent] = await sql<{ id: string }[]>`
    INSERT INTO lead_events (
      lead_id, ceremony_type, event_date, event_location, region, status,
      budget_amount, mua_id, booked_price
    ) VALUES (
      ${leadBooked.id}::uuid,
      'Wedding',
      CURRENT_DATE - 18,
      'Delhi',
      'north'::region,
      'booked'::event_status,
      95000,
      ${muaBookedId}::uuid,
      88000
    )
    RETURNING id
  `;

  const [bookedPush] = await sql<{ id: string }[]>`
    INSERT INTO mua_pushes (
      lead_id, mua_id, stage, status, quoted_total, event_ids, pushed_by, closed_at
    ) VALUES (
      ${leadBooked.id}::uuid,
      ${muaBookedId}::uuid,
      'offer_sent'::mua_push_stage,
      'booked'::mua_push_status,
      88000,
      ${sql.array([weddingEvent.id])}::uuid[],
      ${actorId}::uuid,
      NOW() - INTERVAL '20 days'
    )
    RETURNING id
  `;

  await sql`
    INSERT INTO mua_push_event_prices (push_id, event_id, quoted_price)
    VALUES (${bookedPush.id}::uuid, ${weddingEvent.id}::uuid, 88000)
  `;

  await sql`
    INSERT INTO bookings (
      lead_id, event_id, mua_id, push_id, booked_price, advance_paid, full_paid, created_by
    ) VALUES (
      ${leadBooked.id}::uuid,
      ${weddingEvent.id}::uuid,
      ${muaBookedId}::uuid,
      ${bookedPush.id}::uuid,
      88000,
      25000,
      88000,
      ${actorId}::uuid
    )
  `;

  await sql`
    INSERT INTO comms (lead_id, entry_type, description, actor_id)
    VALUES (
      ${leadBooked.id}::uuid,
      'lead_created',
      'Feedback seed — LD-FB001 booked bride (Olready MUA)',
      ${actorId}::uuid
    )
  `;

  // —— LD-FB002: expired, ceremonies past, MUAs pushed but not booked ——
  const [leadExpired] = await sql<{ id: string }[]>`
    INSERT INTO bride_leads (
      display_id, bride_name, phone, email, city, region, event_date, event_location,
      budget_tier, budget_amount, source, status, verified, verified_at,
      assigned_rm_id, assignment_date, expired_at, group_size, group_notes
    ) VALUES (
      'LD-FB002',
      'Ira Test',
      '+919900000102',
      'ira.feedback@test.olready.in',
      'Mumbai',
      'west'::region,
      CURRENT_DATE - 10,
      'Wedding — Mumbai',
      'tier_2'::budget_tier,
      72000,
      ${FEEDBACK_SEED_SOURCE_TAG},
      'expired'::lead_status,
      true,
      NOW() - INTERVAL '60 days',
      ${actorId}::uuid,
      CURRENT_DATE - 55,
      NOW() - INTERVAL '8 days',
      3,
      'Feedback seed — expired, no booking'
    )
    RETURNING id
  `;

  const [expiredEvent] = await sql<{ id: string }[]>`
    INSERT INTO lead_events (
      lead_id, ceremony_type, event_date, event_location, region, status, budget_amount
    ) VALUES (
      ${leadExpired.id}::uuid,
      'Wedding',
      CURRENT_DATE - 10,
      'Mumbai',
      'west'::region,
      'open'::event_status,
      72000
    )
    RETURNING id
  `;

  for (const [muaId, price] of [
    [muaPushedAId, 68000],
    [muaPushedBId, 71000],
  ] as const) {
    const [push] = await sql<{ id: string }[]>`
      INSERT INTO mua_pushes (
        lead_id, mua_id, stage, status, quoted_total, event_ids, pushed_by
      ) VALUES (
        ${leadExpired.id}::uuid,
        ${muaId}::uuid,
        'offer_sent'::mua_push_stage,
        'active'::mua_push_status,
        ${price},
        ${sql.array([expiredEvent.id])}::uuid[],
        ${actorId}::uuid
      )
      RETURNING id
    `;
    await sql`
      INSERT INTO mua_push_event_prices (push_id, event_id, quoted_price)
      VALUES (${push.id}::uuid, ${expiredEvent.id}::uuid, ${price})
    `;
  }

  await sql`
    INSERT INTO comms (lead_id, entry_type, description, actor_id)
    VALUES (
      ${leadExpired.id}::uuid,
      'lead_created',
      'Feedback seed — LD-FB002 expired bride (pushes only)',
      ${actorId}::uuid
    )
  `;

  return {
    leads: [
      {
        displayId: "LD-FB001",
        brideName: "Sana Test",
        scenario: "Booked via Olready MUA — test connected feedback + MUA suggestion",
      },
      {
        displayId: "LD-FB002",
        brideName: "Ira Test",
        scenario: "Expired, no booking — test busy/callback/no-contact flow",
      },
    ],
  };
}
