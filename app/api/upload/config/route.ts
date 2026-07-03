import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { mergeBudgetTierConfig } from "@/lib/budget-tier";
import { DEFAULT_LEAD_SOURCES, type SlaConfig } from "@/lib/types";

/** Ceremony types for upload forms (lead uploader cannot read admin config). */
export async function GET() {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    const { limits, ranges } = mergeBudgetTierConfig(mockStore.getSla());
    return NextResponse.json({
      data: {
        ceremonyTypes: mockStore.getSla().ceremonyTypes,
        budgetTierRanges: ranges,
        budgetTierLimits: limits,
        leadSources: mockStore.getSla().leadSources ?? DEFAULT_LEAD_SOURCES,
        states: ["Delhi", "Maharashtra", "Rajasthan"],
      },
      error: null,
    });
  }

  const [row] = await sql<SlaConfig[]>`
    SELECT * FROM sla_config WHERE id = 1
  `;
  const sla = row;
  const { limits, ranges } = mergeBudgetTierConfig(sla ?? undefined);
  const sources =
    Array.isArray(sla?.leadSources) && sla.leadSources.length
      ? sla.leadSources
      : DEFAULT_LEAD_SOURCES;
  const stateRows = await sql<{ state: string }[]>`
    SELECT DISTINCT state FROM city_regions WHERE state IS NOT NULL ORDER BY state
  `;
  return NextResponse.json({
    data: {
      ceremonyTypes: sla?.ceremonyTypes ?? ["Wedding"],
      budgetTierRanges: ranges,
      budgetTierLimits: limits,
      leadSources: sources,
      states: stateRows.map((r) => r.state),
    },
    error: null,
  });
}
