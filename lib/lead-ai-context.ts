import type postgres from "postgres";
import { getMakeupLookProfile } from "@/lib/makeup-look-db";
import { formatMakeupLookForAi } from "@/lib/makeup-look";
import { BUDGET_TIER_LABELS } from "@/lib/types";

type Sql = postgres.Sql<Record<string, unknown>>;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export async function buildLeadAiContext(sql: Sql, leadId: string): Promise<string> {
  const [lead] = await sql<
    {
      brideName: string;
      phone: string;
      city: string;
      region: string;
      status: string;
      eventDate: string | null;
      eventLocation: string | null;
      budgetAmount: number | null;
      budgetTier: string;
      groupSize: number | null;
      groupNotes: string | null;
      source: string | null;
    }[]
  >`
    SELECT
      bride_name AS "brideName",
      phone,
      city,
      region::text AS region,
      status::text AS status,
      event_date::text AS "eventDate",
      event_location AS "eventLocation",
      budget_amount AS "budgetAmount",
      budget_tier::text AS "budgetTier",
      group_size AS "groupSize",
      group_notes AS "groupNotes",
      source
    FROM bride_leads
    WHERE id = ${leadId}::uuid
    LIMIT 1
  `;

  if (!lead) return "";

  const events = await sql<
    {
      ceremonyType: string;
      eventDate: string | null;
      eventLocation: string | null;
      region: string | null;
      budgetAmount: number | null;
      status: string;
    }[]
  >`
    SELECT
      ceremony_type AS "ceremonyType",
      event_date::text AS "eventDate",
      event_location AS "eventLocation",
      region::text AS region,
      budget_amount AS "budgetAmount",
      status::text AS status
    FROM lead_events
    WHERE lead_id = ${leadId}::uuid
    ORDER BY event_date NULLS LAST, ceremony_type
  `;

  const makeup = await getMakeupLookProfile(sql, leadId);

  const comms = await sql<{ type: string; description: string; createdAt: string }[]>`
    SELECT
      type::text AS type,
      description,
      created_at::text AS "createdAt"
    FROM comms
    WHERE lead_id = ${leadId}::uuid
    ORDER BY created_at DESC
    LIMIT 8
  `;

  const pushes = await sql<{ muaName: string; stage: string; status: string }[]>`
    SELECT
      m.name AS "muaName",
      mp.stage::text AS stage,
      mp.status::text AS status
    FROM mua_pushes mp
    JOIN muas m ON m.id = mp.mua_id
    WHERE mp.lead_id = ${leadId}::uuid AND mp.status = 'active'
    ORDER BY mp.created_at DESC
    LIMIT 6
  `;

  const lines: string[] = [
    `Bride: ${lead.brideName} | Phone: ${lead.phone}`,
    `City: ${lead.city} | Region: ${lead.region} | Status: ${lead.status.replace(/_/g, " ")}`,
    `Lead event date: ${fmtDate(lead.eventDate)} | Location: ${lead.eventLocation ?? lead.city}`,
    `Budget: ${lead.budgetAmount != null ? `Rs ${lead.budgetAmount}` : "not set"} | Tier: ${BUDGET_TIER_LABELS[lead.budgetTier as keyof typeof BUDGET_TIER_LABELS] ?? lead.budgetTier}`,
  ];

  if (lead.groupSize != null || lead.groupNotes) {
    lines.push(
      `Group: ${lead.groupSize ?? "—"}${lead.groupNotes ? ` — ${lead.groupNotes}` : ""}`,
    );
  }
  if (lead.source) lines.push(`Source: ${lead.source}`);

  if (events.length) {
    lines.push(
      "Ceremonies:",
      ...events.map(
        (e) =>
          `- ${e.ceremonyType} (${fmtDate(e.eventDate)}, ${e.eventLocation ?? lead.city}, ${e.region ?? lead.region}) — budget ${e.budgetAmount != null ? `Rs ${e.budgetAmount}` : "—"}, ${e.status.replace(/_/g, " ")}`,
      ),
    );
  }

  const makeupBlock = makeup ? formatMakeupLookForAi(makeup) : "";
  if (makeupBlock) lines.push("Makeup look:", makeupBlock);

  if (pushes.length) {
    lines.push(
      "Active MUA pushes:",
      ...pushes.map((p) => `- ${p.muaName} — ${p.stage.replace(/_/g, " ")} (${p.status})`),
    );
  }

  if (comms.length) {
    lines.push(
      "Recent notes/comms:",
      ...comms.map((c) => `- [${c.type}] ${c.description.slice(0, 200)}`),
    );
  }

  return lines.join("\n");
}
