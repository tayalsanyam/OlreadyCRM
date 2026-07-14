import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  fetchIntakeLeadRows,
  fetchIntakeOverdueTasks,
  fetchIntakePerformanceSummary,
} from "@/lib/reports/intake-performance-query";
import { csvResponse } from "@/lib/report-utils";
import { csvDateCell } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const region = searchParams.get("region");
  const staffId = searchParams.get("staffId");
  const role = searchParams.get("role") as "regional_rm" | "commission_rm" | null;
  const confirmationStatus = searchParams.get("confirmationStatus");
  const gate = searchParams.get("gate") as "open" | "complete" | null;

  if (USE_MOCK) {
    const data = mockStore.getIntakePerformance({ staffId, region });
    if (format === "csv") {
      return csvResponse(
        "intake-performance",
        [
          "Display ID",
          "Bride",
          "RM",
          "Region",
          "Status",
          "Confirmation",
          "Profiles",
          "Gate",
          "Pending task",
          "Due",
        ],
        data.leads.map((l) => [
          l.displayId,
          l.brideName,
          l.assignedRmName ?? "",
          l.region ?? "",
          l.status,
          l.confirmationStatus,
          l.intakeProfilesCount,
          l.intakeGateComplete ? "complete" : "open",
          l.pendingTaskTitle ?? "",
          csvDateCell(l.pendingTaskDue),
        ])
      );
    }
    return NextResponse.json({ data, error: null });
  }

  const [summary, leads, overdueTasks] = await Promise.all([
    fetchIntakePerformanceSummary({ region, staffId, roleFilter: role }),
    fetchIntakeLeadRows({
      region,
      staffId,
      roleFilter: role,
      confirmationStatus,
      gate,
    }),
    fetchIntakeOverdueTasks({ region, staffId, roleFilter: role }),
  ]);

  if (format === "csv") {
    return csvResponse(
      "intake-performance",
      [
        "Display ID",
        "Bride",
        "RM",
        "Region",
        "Status",
        "Confirmation",
        "Profiles",
        "Gate",
        "Attempts",
        "Pending task",
        "Due",
        "Days since assign",
        "Days to confirm",
      ],
      leads.map((l) => [
        l.displayId,
        l.brideName,
        l.assignedRmName ?? "",
        l.region ?? "",
        l.status,
        l.confirmationStatus,
        l.intakeProfilesCount,
        l.intakeGateComplete ? "complete" : "open",
        l.confirmationAttempts,
        l.pendingTaskTitle ?? "",
        csvDateCell(l.pendingTaskDue),
        l.daysSinceAssignment ?? "",
        l.daysToConfirm ?? "",
      ])
    );
  }

  return NextResponse.json({ data: { summary, leads, overdueTasks }, error: null });
}
