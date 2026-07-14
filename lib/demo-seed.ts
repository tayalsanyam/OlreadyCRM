import postgres from "postgres";
import {
  DEMO_LEAD_DISPLAY_IDS,
  DEMO_MUA_DISPLAY_IDS,
  DEMO_SOURCE_TAG,
} from "@/lib/demo-data";

type Sql = postgres.Sql<Record<string, unknown>>;

export async function seedDemoData(sql: Sql): Promise<{
  leads: string[];
  muas: string[];
}> {
  const [kanika] = await sql<{ id: string }[]>`
    SELECT id FROM staff WHERE email = 'kanika@olready.in' LIMIT 1
  `;
  if (!kanika) {
    throw new Error("Kanika not found — run npm run db:seed first");
  }

  const muaIds: Record<string, string> = {};
  const muas = [
    { displayId: "MUA-0001", name: "Deepa Artistry", city: "Delhi", tier: "highest_privy", phone: "9810011111", whatsapp: "9810011111" },
    { displayId: "MUA-0002", name: "Zara Bridal", city: "Mumbai", tier: "phoenix_2", phone: "9820022222", whatsapp: "9820022222" },
    { displayId: "MUA-0003", name: "Glam Studio", city: "Bangalore", tier: "phoenix", phone: "9830033333", whatsapp: "9830033333" },
    { displayId: "MUA-0004", name: "Freelance by Riya", city: "Delhi", tier: null, phone: "9840044444", whatsapp: "9840044444" },
  ];
  for (const m of muas) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO muas (display_id, name, city, plan_tier, status, phone, whatsapp, source)
      VALUES (
        ${m.displayId},
        ${m.name},
        ${m.city},
        ${m.tier ? sql`${m.tier}::plan_tier` : null},
        'active',
        ${m.phone},
        ${m.whatsapp ?? m.phone},
        'Referral'
      )
      ON CONFLICT (display_id) DO UPDATE SET
        name = EXCLUDED.name,
        city = EXCLUDED.city,
        plan_tier = EXCLUDED.plan_tier,
        phone = EXCLUDED.phone,
        whatsapp = EXCLUDED.whatsapp,
        source = COALESCE(muas.source, EXCLUDED.source)
      RETURNING id
    `;
    muaIds[m.displayId] = row.id;
  }

  const [salesRm] = await sql<{ id: string }[]>`
    SELECT id
    FROM staff
    WHERE email = 'sales.rm@olready.in' AND active = true
    LIMIT 1
  `;
  if (!salesRm) {
    throw new Error("Sales RM user not found — run npm run db:seed first");
  }

  async function ensureActivationDemoPipeline(args: {
    muaDisplayId: string;
    muaType: "candidate" | "re_engage";
    paymentAmount: number;
    paymentMode: "UPI" | "Cash" | "Bank Transfer" | "Card" | "Other";
    invoiceNumber: string;
  }) {
    const muaId = muaIds[args.muaDisplayId];
    if (!muaId) return;

    await sql`
      UPDATE muas
      SET status = 'active',
          source = COALESCE(source, 'Referral')
      WHERE id = ${muaId}::uuid
    `;

    const [existing] = await sql<{ id: string }[]>`
      SELECT id
      FROM sales.pipeline
      WHERE mua_id = ${muaId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const pipelineId =
      existing?.id ??
      (
        await sql<{ id: string }[]>`
          INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
          VALUES (${muaId}::uuid, ${args.muaType}, 'Deal Closed', 'closed', ${salesRm.id}::uuid)
          RETURNING id
        `
      )[0].id;

    await sql`
      UPDATE sales.pipeline
      SET mua_type = ${args.muaType},
          stage = 'Deal Closed',
          status = 'closed',
          assigned_to = ${salesRm.id}::uuid,
          sales_closed_by = COALESCE(sales_closed_by, ${salesRm.id}::uuid),
          updated_at = NOW()
      WHERE id = ${pipelineId}::uuid
    `;

    await sql`
      INSERT INTO sales.payment_records (pipeline_id, amount, payment_date, payment_mode, notes)
      SELECT
        ${pipelineId}::uuid,
        ${args.paymentAmount},
        CURRENT_DATE - INTERVAL '2 day',
        ${args.paymentMode},
        'Demo seed payment'
      WHERE NOT EXISTS (
        SELECT 1 FROM sales.payment_records WHERE pipeline_id = ${pipelineId}::uuid
      )
    `;

    await sql`
      INSERT INTO sales.onboarding (
        pipeline_id, mua_name, business_name, official_address, email, plan, lead_cap, lead_budget,
        states, regions, cities, social_media, duration_start, duration_end, checklist1_complete, checklist2_complete
      )
      VALUES (
        ${pipelineId}::uuid,
        (SELECT name FROM muas WHERE id = ${muaId}::uuid),
        (SELECT name FROM muas WHERE id = ${muaId}::uuid),
        'Demo Address',
        'demo@olready.in',
        'prime',
        120,
        'tier_2',
        ARRAY(
          (SELECT state FROM rm.city_regions
           WHERE city = (SELECT city FROM muas WHERE id = ${muaId}::uuid)
           LIMIT 1)
        )::text[],
        ARRAY(
          (SELECT region::text FROM rm.city_regions
           WHERE city = (SELECT city FROM muas WHERE id = ${muaId}::uuid)
           LIMIT 1)
        )::text[],
        ARRAY[(SELECT city FROM muas WHERE id = ${muaId}::uuid)]::text[],
        '@demo_handle',
        CURRENT_DATE - INTERVAL '30 day',
        CURRENT_DATE + INTERVAL '150 day',
        true,
        true
      )
      ON CONFLICT (pipeline_id) DO UPDATE SET
        checklist1_complete = true,
        checklist2_complete = true,
        plan = 'prime',
        duration_start = CURRENT_DATE - INTERVAL '30 day',
        duration_end = CURRENT_DATE + INTERVAL '150 day',
        updated_at = NOW()
    `;

    await sql`
      INSERT INTO sales.training (
        pipeline_id, profile_link, step_lead_unlock, step_lead_budget, step_lead_reversal,
        step_role_of_rm, step_rm_contact, step_lead_views, complete
      )
      VALUES (
        ${pipelineId}::uuid,
        'https://olready.in/profile/demo-mua',
        true, true, true, true, true, true, true
      )
      ON CONFLICT (pipeline_id) DO UPDATE SET
        profile_link = EXCLUDED.profile_link,
        step_lead_unlock = true,
        step_lead_budget = true,
        step_lead_reversal = true,
        step_role_of_rm = true,
        step_rm_contact = true,
        step_lead_views = true,
        complete = true,
        updated_at = NOW()
    `;

    await sql`
      INSERT INTO sales.activation_log (
        pipeline_id,
        profile_link_verified,
        invoice_generated,
        invoice_number,
        invoice_generated_at,
        contract_generated,
        contract_generated_at,
        contract_url,
        contract_uploaded_at,
        activated_at,
        sent_back_at,
        sent_back_note
      )
      VALUES (
        ${pipelineId}::uuid,
        true,
        true,
        ${args.invoiceNumber},
        NOW() - INTERVAL '1 day',
        true,
        NOW() - INTERVAL '1 day',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
      )
      ON CONFLICT (pipeline_id) DO UPDATE SET
        profile_link_verified = true,
        invoice_generated = true,
        invoice_number = ${args.invoiceNumber},
        contract_generated = true,
        contract_url = NULL,
        contract_uploaded_at = NULL,
        activated_at = NULL,
        sent_back_at = NULL,
        sent_back_note = NULL
    `;
  }

  await ensureActivationDemoPipeline({
    muaDisplayId: "MUA-0002",
    muaType: "re_engage",
    paymentAmount: 65000,
    paymentMode: "UPI",
    invoiceNumber: "INV-DEMO-1001",
  });
  await ensureActivationDemoPipeline({
    muaDisplayId: "MUA-0004",
    muaType: "candidate",
    paymentAmount: 48000,
    paymentMode: "Bank Transfer",
    invoiceNumber: "INV-DEMO-1002",
  });

  async function nextTaskDisplayId(): Promise<string> {
    const [row] = await sql<{ n: number }[]>`
      SELECT COALESCE(
        MAX((regexp_match(display_id, '^TK-([0-9]+)$'))[1]::int),
        0
      ) + 1 AS n
      FROM rm_tasks
      WHERE display_id ~ '^TK-[0-9]+$'
    `;
    return `TK-${String(row?.n ?? 1).padStart(5, "0")}`;
  }

  async function ensureActiveSalesPipeline(args: {
    muaDisplayId: string;
    muaType: "candidate" | "re_engage" | "renewal";
    stage: string;
    taskTitle: string;
  }): Promise<string | null> {
    const muaId = muaIds[args.muaDisplayId];
    if (!muaId) return null;

    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM sales.pipeline
      WHERE mua_id = ${muaId}::uuid AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const pipelineId =
      existing?.id ??
      (
        await sql<{ id: string }[]>`
          INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to, sales_closed_by)
          VALUES (${muaId}::uuid, ${args.muaType}, ${args.stage}, 'active', ${salesRm.id}::uuid, NULL)
          RETURNING id
        `
      )[0]?.id;

    if (!pipelineId) return null;

    await sql`
      UPDATE sales.pipeline
      SET mua_type = ${args.muaType},
          stage = ${args.stage},
          status = 'active',
          assigned_to = ${salesRm.id}::uuid,
          updated_at = NOW()
      WHERE id = ${pipelineId}::uuid
    `;

    const pipelineRef = `[PIPE:${pipelineId}]`;
    const [pendingTask] = await sql<{ id: string }[]>`
      SELECT id FROM rm_tasks
      WHERE staff_id = ${salesRm.id}::uuid
        AND status = 'pending'
        AND title LIKE ${`%${pipelineRef}%`}
      LIMIT 1
    `;

    if (!pendingTask) {
      const taskDisplayId = await nextTaskDisplayId();
      await sql`
        INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
        VALUES (
          ${taskDisplayId},
          ${salesRm.id}::uuid,
          NULL,
          NULL,
          'sales_follow_up'::task_type,
          ${`${args.taskTitle} — ${(await sql<{ name: string }[]>`SELECT name FROM muas WHERE id = ${muaId}::uuid`)[0]?.name ?? "MUA"} ${pipelineRef}`},
          CURRENT_DATE + 1,
          'pending'
        )
      `;
    }

    return pipelineId;
  }

  await ensureActiveSalesPipeline({
    muaDisplayId: "MUA-0001",
    muaType: "candidate",
    stage: "Follow Up",
    taskTitle: "Follow Up follow-up",
  });
  await ensureActiveSalesPipeline({
    muaDisplayId: "MUA-0003",
    muaType: "candidate",
    stage: "Demo Scheduled",
    taskTitle: "Demo Scheduled follow-up",
  });

  const [lead1] = await sql<{ id: string }[]>`
    INSERT INTO bride_leads (
      display_id, bride_name, phone, email, city, region, event_date,
      budget_tier, budget_amount, source, status, verified,
      assigned_rm_id, assignment_date, group_size, group_notes
    ) VALUES (
      'LD-00001',
      'Aisha Khan',
      '+919811100001',
      'aisha@email.com',
      'Delhi',
      'north',
      CURRENT_DATE + 25,
      'tier_1',
      150000,
      ${DEMO_SOURCE_TAG},
      'assigned',
      true,
      ${kanika.id}::uuid,
      CURRENT_DATE - 5,
      3,
      'Bride + 2 bridesmaids — shared Haldi'
    )
    ON CONFLICT (display_id) DO UPDATE SET
      bride_name = EXCLUDED.bride_name,
      source = ${DEMO_SOURCE_TAG},
      assigned_rm_id = EXCLUDED.assigned_rm_id,
      status = 'assigned',
      verified = true
    RETURNING id
  `;

  await sql`
    INSERT INTO lead_events (lead_id, ceremony_type, event_date, status)
    SELECT ${lead1.id}::uuid, t.ceremony, CURRENT_DATE + 25, 'open'
    FROM (VALUES ('Haldi'), ('Wedding')) AS t(ceremony)
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_events le
      WHERE le.lead_id = ${lead1.id}::uuid AND le.ceremony_type = t.ceremony
    )
  `;

  const [lead2] = await sql<{ id: string }[]>`
    INSERT INTO bride_leads (
      display_id, bride_name, phone, email, city, region, event_date,
      budget_tier, budget_amount, source, status, verified, verified_at
    ) VALUES (
      'LD-00002',
      'Meera Patel',
      '+919822200002',
      'meera@email.com',
      'Mumbai',
      'west',
      CURRENT_DATE + 75,
      'tier_2',
      80000,
      ${DEMO_SOURCE_TAG},
      'verified',
      true,
      NOW()
    )
    ON CONFLICT (display_id) DO UPDATE SET
      bride_name = EXCLUDED.bride_name,
      source = ${DEMO_SOURCE_TAG},
      status = 'verified',
      verified = true,
      assigned_rm_id = NULL
    RETURNING id
  `;

  if (lead2) {
    await sql`
      INSERT INTO lead_events (lead_id, ceremony_type, event_date, status)
      SELECT ${lead2.id}::uuid, 'Wedding', CURRENT_DATE + 75, 'open'
      WHERE NOT EXISTS (
        SELECT 1 FROM lead_events WHERE lead_id = ${lead2.id}::uuid
      )
    `;
  }

  const events = await sql<{ id: string; ceremonyType: string }[]>`
    SELECT id, ceremony_type FROM lead_events WHERE lead_id = ${lead1.id}::uuid
  `;
  const haldi = events.find((e) => e.ceremonyType === "Haldi");
  const wedding = events.find((e) => e.ceremonyType === "Wedding");
  const eventIds = [haldi?.id, wedding?.id].filter((id): id is string => Boolean(id));

  if (haldi && muaIds["MUA-0001"]) {
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM mua_pushes
      WHERE lead_id = ${lead1.id}::uuid AND mua_id = ${muaIds["MUA-0001"]}::uuid
      LIMIT 1
    `;
    if (!existing) {
      const [push] = await sql<{ id: string }[]>`
        INSERT INTO mua_pushes (
          lead_id, mua_id, stage, status, quoted_total, event_ids, pushed_by
        ) VALUES (
          ${lead1.id}::uuid,
          ${muaIds["MUA-0001"]}::uuid,
          'offer_sent',
          'active',
          85000,
          ${sql.array(eventIds)}::uuid[],
          ${kanika.id}::uuid
        )
        RETURNING id
      `;
      await sql`
        INSERT INTO mua_push_event_prices (push_id, event_id, quoted_price)
        VALUES (${push.id}::uuid, ${haldi.id}::uuid, 35000)
        ON CONFLICT DO NOTHING
      `;

      const [existingTask] = await sql<{ id: string }[]>`
        SELECT id FROM rm_tasks
        WHERE push_id = ${push.id}::uuid AND status = 'pending'
        LIMIT 1
      `;
      if (!existingTask) {
        const taskDisplayId = await nextTaskDisplayId();
        await sql`
          INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
          VALUES (
            ${taskDisplayId},
            ${kanika.id}::uuid,
            ${lead1.id}::uuid,
            ${push.id}::uuid,
            'follow_up'::task_type,
            ${`Follow up — Deepa Artistry / Aisha Khan`},
            CURRENT_DATE + 1,
            'pending'
          )
        `;
      }
    }
  }

  await sql`
    INSERT INTO bride_leads (
      display_id, bride_name, phone, city, region, event_date,
      budget_tier, budget_amount, source, status, verified,
      assigned_rm_id, assignment_date, shifted_at, handover_reason
    ) VALUES (
      'LD-00007',
      'Divya Joshi',
      '+919844400004',
      'Jaipur',
      'north',
      CURRENT_DATE + 60,
      'tier_3',
      55000,
      ${DEMO_SOURCE_TAG},
      'commission_rm',
      true,
      ${kanika.id}::uuid,
      CURRENT_DATE - 40,
      NOW() - INTERVAL '5 days',
      'Not Interested in Plan MUAs'
    )
    ON CONFLICT (display_id) DO UPDATE SET source = ${DEMO_SOURCE_TAG}
  `;

  const [pending] = await sql<{ id: string }[]>`
    INSERT INTO bride_leads (
      display_id, bride_name, phone, city, region, event_date,
      budget_tier, budget_amount, source, status, verified
    ) VALUES (
      'LD-00009',
      'Tanvi Shah',
      '+919833300003',
      'Delhi',
      'north',
      CURRENT_DATE + 90,
      'tier_3',
      45000,
      ${DEMO_SOURCE_TAG},
      'pending_verification',
      false
    )
    ON CONFLICT (display_id) DO UPDATE SET source = ${DEMO_SOURCE_TAG}
    RETURNING id
  `;

  if (pending) {
    await sql`
      INSERT INTO lead_events (lead_id, ceremony_type, status)
      SELECT ${pending.id}::uuid, 'Wedding', 'open'
      WHERE NOT EXISTS (
        SELECT 1 FROM lead_events WHERE lead_id = ${pending.id}::uuid
      )
    `;
  }

  return {
    leads: [...DEMO_LEAD_DISPLAY_IDS],
    muas: [...DEMO_MUA_DISPLAY_IDS],
  };
}

export async function cleanDemoData(sql: Sql): Promise<{
  leadsRemoved: number;
  muasRemoved: number;
}> {
  const leadIds = await sql<{ id: string }[]>`
    SELECT id FROM bride_leads
    WHERE display_id = ANY(${sql.array([...DEMO_LEAD_DISPLAY_IDS])})
       OR source = ${DEMO_SOURCE_TAG}
  `;
  const ids = leadIds.map((r) => r.id);

  if (ids.length > 0) {
    await sql`
      DELETE FROM bookings WHERE lead_id = ANY(${sql.array(ids)}::uuid[])
    `;
    await sql`
      DELETE FROM audit_log
      WHERE record_id = ANY(${sql.array(ids)}::uuid[])
    `;
    await sql`
      DELETE FROM bride_leads WHERE id = ANY(${sql.array(ids)}::uuid[])
    `;
  }

  const removedMuas = await sql<{ count: number }[]>`
    WITH deleted AS (
      DELETE FROM muas
      WHERE display_id = ANY(${sql.array([...DEMO_MUA_DISPLAY_IDS])})
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `;

  return {
    leadsRemoved: ids.length,
    muasRemoved: removedMuas[0]?.count ?? 0,
  };
}
