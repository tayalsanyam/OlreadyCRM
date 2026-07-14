import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { scopeFromSession } from "@/lib/report-scope";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  fetchIntakeLeadRows,
  fetchIntakePerformanceSummary,
} from "@/lib/reports/intake-performance-query";
import { csvResponse } from "@/lib/report-utils";

export async function GET(request: Request) {
  const auth = await requireRoles(["regionalRm", "commissionRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const scope = scopeFromSession(auth.session);
  const staffId = scope.kind === "rm" ? scope.staffId : auth.session.userId;
  const roleFilter =
    auth.session.role === "commissionRm" ? "commission_rm" : "regional_rm";

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const confirmationStatus = searchParams.get("confirmationStatus");
  const gate = searchParams.get("gate") as "open" | "complete" | null;

  if (USE_MOCK) {
    const data = mockStore.getIntakePerformance({ staffId });
    if (format === "csv") {
      return csvResponse(
        "my-intake",
        ["Display ID", "Bride", "Confirmation", "Profiles", "Pending task", "Due"],
        data.leads.map((l) => [
          l.displayId,
          l.brideName,
          l.confirmationStatus,
          l.intakeProfilesCount,
          l.pendingTaskTitle ?? "",
          l.pendingTaskDue ?? "",
        ])
      );
    }
    return NextResponse.json({ data, error: null });
  }

  const [summary, leads] = await Promise.all([
    fetchIntakePerformanceSummary({ staffId, roleFilter }),
    fetchIntakeLeadRows({ staffId, confirmationStatus, gate }),
  ]);

  if (format === "csv") {
    return csvResponse(
      "my-intake",
      [
        "Display ID",
        "Bride",
        "Confirmation",
        "Profiles",
        "Gate",
        "Pending task",
        "Due",
      ],
      leads.map((l) => [
        l.displayId,
        l.brideName,
        l.confirmationStatus,
        l.intakeProfilesCount,
        l.intakeGateComplete ? "complete" : "open",
        l.pendingTaskTitle ?? "",
        l.pendingTaskDue ?? "",
      ])
    );
  }

  return NextResponse.json({ data: { summary, leads }, error: null });
}
