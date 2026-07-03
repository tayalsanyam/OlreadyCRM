/**
 * Duplicate lead Aarya for feedback-flow testing.
 * Run: node --env-file=.env.local scripts/duplicate-aarya-lead.mjs
 * Optional env: NEW_PHONE, NEW_EVENT_DATE, FEEDBACK_READY=1 (expired + past event)
 */
import postgres from "postgres";

const SOURCE_ID = "327d88e4-6597-4aec-8205-082527801acc";
const NEW_PHONE = process.env.NEW_PHONE ?? "9878166555";
const NEW_EVENT_DATE = process.env.NEW_EVENT_DATE ?? "2026-06-10";
const FEEDBACK_READY = process.env.FEEDBACK_READY !== "0";

function connectionString() {
  let raw = process.env.DATABASE_URL ?? "";
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}options=-c%20search_path%3Drm`;
}

const sql = postgres(connectionString());

async function generateLeadDisplayId(tx) {
  const [row] = await tx`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^LD-([0-9]+)$'))[1]::int),
      0
    ) + 1 AS n
    FROM bride_leads
    WHERE display_id ~ '^LD-[0-9]+$'
  `;
  return `LD-${String(row?.n ?? 1).padStart(5, "0")}`;
}

try {
  const [src] = await sql`
    SELECT * FROM bride_leads WHERE id = ${SOURCE_ID}::uuid
  `;
  if (!src) throw new Error("Source lead Aarya not found");

  const events = await sql`
    SELECT ceremony_type, event_date, status, budget_amount, description
    FROM lead_events WHERE lead_id = ${SOURCE_ID}::uuid
    ORDER BY event_date
  `;

  const displayId = await sql.begin(async (tx) => {
    const newDisplayId = await generateLeadDisplayId(tx);
    const [lead] = await tx`
      INSERT INTO bride_leads (
        display_id, bride_name, phone, email, city, region,
        event_location, event_date, budget_amount, budget_tier, source,
        group_size, group_notes, status, verified, verified_at,
        portal_only, portal_pushed, portal_cap, expired_at
      ) VALUES (
        ${newDisplayId},
        ${src.bride_name},
        ${NEW_PHONE},
        ${src.email},
        ${src.city},
        ${src.region},
        ${src.event_location},
        ${NEW_EVENT_DATE}::date,
        ${src.budget_amount},
        ${src.budget_tier},
        ${src.source},
        ${src.group_size},
        ${src.group_notes},
        ${FEEDBACK_READY ? "expired" : "verified"},
        true,
        NOW(),
        ${src.portal_only},
        false,
        ${src.portal_cap},
        ${FEEDBACK_READY ? sql`NOW()` : null}
      )
      RETURNING id, display_id
    `;

    for (const ev of events.length ? events : [{ ceremony_type: "Wedding", budget_amount: src.budget_amount, description: null }]) {
      await tx`
        INSERT INTO lead_events (
          lead_id, ceremony_type, event_date, status, budget_amount, description
        ) VALUES (
          ${lead.id}::uuid,
          ${ev.ceremony_type},
          ${NEW_EVENT_DATE}::date,
          ${FEEDBACK_READY ? "booked" : "open"},
          ${ev.budget_amount},
          ${ev.description}
        )
      `;
    }

    await tx`
      INSERT INTO comms (lead_id, entry_type, description, metadata)
      VALUES (
        ${lead.id}::uuid,
        'lead_created',
        ${`Test copy of ${src.display_id} — phone ${NEW_PHONE}, event ${NEW_EVENT_DATE}`},
        ${tx.json({ copiedFrom: SOURCE_ID })}
      )
    `;

    return lead;
  });

  console.log("Created duplicate lead:");
  console.log(JSON.stringify(displayId, null, 2));
  console.log(`\nPhone: ${NEW_PHONE}`);
  console.log(`Event date: ${NEW_EVENT_DATE}`);
  console.log(`Status: ${FEEDBACK_READY ? "expired (feedback-ready)" : "verified"}`);
  if (FEEDBACK_READY) {
    console.log(`\nReady for Feedback → Post-event leads (event ${NEW_EVENT_DATE} is in the past).`);
  } else {
    console.log(
      `\nNote: Set FEEDBACK_READY=1 for expired status + past event date.`
    );
  }
} finally {
  await sql.end();
}
