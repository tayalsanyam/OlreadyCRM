import { NextResponse } from "next/server";
import {
  withTransaction,
  appendComm,
  generateLeadDisplayId,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { loadBudgetTierConfig } from "@/lib/budget-tier-db";
import { resolveBudgetTierFromAmount } from "@/lib/budget-tier";
import { toDbTier } from "@/lib/db-mappers";
import { refreshLeadPhase } from "@/lib/lead-phase";
import type { BudgetTier } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { rows: Record<string, string>[] };

  if (!body.rows?.length) {
    return NextResponse.json({ data: null, error: "rows required" }, { status: 400 });
  }

  if (USE_MOCK) {
    const created = mockStore.importCsv(body.rows);
    return NextResponse.json({ data: { count: created.length }, error: null });
  }

  let count = 0;
  await withTransaction(async (tx) => {
    const tierConfig = await loadBudgetTierConfig(tx);
    for (const row of body.rows) {
      const phone = row.phone ?? row.mobile ?? "";
      if (!phone) continue;

      const [dup] = await tx<{ id: string }[]>`
        SELECT id FROM bride_leads WHERE phone = ${phone} LIMIT 1
      `;
      if (dup) continue;

      const displayId = await generateLeadDisplayId(tx);
      const region = (row.region ?? "north").toLowerCase();
      const budgetNum = Number(row.budget) || 0;
      const tierKey: BudgetTier =
        budgetNum > 0
          ? resolveBudgetTierFromAmount(budgetNum, tierConfig.limits)
          : "tier1";
      const [lead] = await tx<{ id: string }[]>`
        INSERT INTO bride_leads (
          display_id, bride_name, phone, email, city, region,
          event_location, event_date, budget_amount, budget_tier, source, status, lead_phase
        ) VALUES (
          ${displayId},
          ${row.bride_name ?? row.name ?? "Unknown"},
          ${phone},
          ${row.email ?? null},
          ${row.city ?? "Delhi"},
          ${region}::region,
          ${row.event_location ?? null},
          ${row.event_date ?? "2026-12-01"},
          ${budgetNum > 0 ? budgetNum : null},
          ${toDbTier(tierKey)}::budget_tier,
          ${row.source ?? "CSV"},
          'pending_verification',
          'pending_verification'
        )
        RETURNING id
      `;
      if (lead) {
        await tx`
          INSERT INTO lead_events (lead_id, ceremony_type, event_date, status)
          VALUES (${lead.id}::uuid, 'Wedding', ${row.event_date ?? null}, 'open')
        `;
        await appendComm(tx, {
          leadId: lead.id,
          entryType: COMM.leadCreated,
          description: "Imported via CSV",
          actorId: auth.session.userId,
        });
        await refreshLeadPhase(tx, lead.id);
        count++;
      }
    }
  });

  return NextResponse.json({ data: { count }, error: null });
}
