import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { sql } from "@/db/index";
import {
  fetchFinancialBreakdown,
  fetchFinancialDetails,
  fetchFinancialSummary,
  type FinancialIncomeType,
  type FinancialSegmentBy,
} from "@/lib/financial-report-query";
import { csvResponse } from "@/lib/report-utils";
import { csvDateCell } from "@/lib/utils";

function parseIncomeType(v: string | null): FinancialIncomeType {
  return v === "commission" ? "commission" : "sales";
}

function parseSegmentBy(
  v: string | null,
  incomeType: FinancialIncomeType
): FinancialSegmentBy {
  if (v === "plan" || v === "region" || v === "lead" || v === "user") {
    if (incomeType === "sales" && v === "lead") return "user";
    return v;
  }
  return "user";
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const incomeType = parseIncomeType(searchParams.get("incomeType"));
  const segmentBy = parseSegmentBy(searchParams.get("segmentBy"), incomeType);
  const staffId = searchParams.get("staffId");

  if (USE_MOCK) {
    const data = mockStore.getFinancialReport({
      dateFrom,
      dateTo,
      incomeType,
      segmentBy,
    });
    if (format === "csv") {
      return csvResponse(
        "financial-report",
        ["Date", "Type", "Amount", "Label", "Staff", "Plan", "Region", "Lead"],
        data.details.map((r) => [
          csvDateCell(r.date),
          r.incomeType,
          r.amount,
          r.label,
          r.staffName ?? "",
          r.plan ?? "",
          r.region ?? "",
          r.brideName ? `${r.brideName} (${r.leadDisplayId ?? ""})` : "",
        ])
      );
    }
    return NextResponse.json({ data, error: null });
  }

  const [summary, breakdown, details, staffOptions] = await Promise.all([
    fetchFinancialSummary({ dateFrom, dateTo, staffId }),
    fetchFinancialBreakdown({ dateFrom, dateTo, incomeType, segmentBy, staffId }),
    fetchFinancialDetails({ dateFrom, dateTo, incomeType, segmentBy, staffId }),
    sql<{ id: string; name: string; role: string }[]>`
      SELECT id, name, role::text AS role
      FROM staff
      WHERE active = true
      ORDER BY name
    `,
  ]);

  if (format === "csv") {
    return csvResponse(
      "financial-report",
      ["Date", "Type", "Amount", "Label", "Staff", "Plan", "Region", "Lead"],
        details.map((r) => [
          csvDateCell(r.date),
        r.incomeType,
        r.amount,
        r.label,
        r.staffName ?? "",
        r.plan ?? "",
        r.region ?? "",
        r.brideName ? `${r.brideName} (${r.leadDisplayId ?? ""})` : "",
      ])
    );
  }

  return NextResponse.json({
    data: { summary, breakdown, details, incomeType, segmentBy, staffOptions },
    error: null,
  });
}
