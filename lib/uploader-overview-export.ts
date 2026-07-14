import type { OverviewSection } from "@/lib/download-overview-csv";
import type { AdminUploaderOverview } from "@/lib/admin-uploader-overview-query";
import { overviewDateRangeLabel } from "@/lib/admin-overview-date-range";

export function buildUploaderOverviewSections(data: AdminUploaderOverview): OverviewSection[] {
  const { dateRange, tabs, verifiedRouting, notInterestedBreakdown, mtd, pendingReferrals, reverifyTasks, pendingLeads, staff } =
    data;

  const staffTotals = {
    added: staff.reduce((n, s) => n + s.addedMtd, 0),
    verified: staff.reduce((n, s) => n + s.verifiedMtd, 0),
    rejected: staff.reduce((n, s) => n + s.rejectedMtd, 0),
    notAnswering: staff.reduce((n, s) => n + s.notAnsweringMtd, 0),
    niClosed: staff.reduce((n, s) => n + s.niClosedMtd, 0),
    deactivated: staff.reduce((n, s) => n + s.deactivatedMtd, 0),
    openTasks: staff.reduce((n, s) => n + s.openTasks, 0),
    overdue: staff.reduce((n, s) => n + s.overdueTasks, 0),
    calls: staff.reduce((n, s) => n + s.callsMtd, 0),
  };

  return [
    {
      title: `Lead uploader overview — exported ${new Date().toLocaleString("en-IN")}`,
      rows: [["Date range", overviewDateRangeLabel(dateRange)]],
    },
    {
      title: "Workspace tabs (current)",
      headers: ["Tab", "Count"],
      rows: [
        ["Not verified (pending)", tabs.pending],
        ["Verified", tabs.verified],
        ["Review", tabs.review],
        ["Closed", tabs.closed],
      ],
    },
    {
      title: "Verified routing",
      headers: ["Route", "Count"],
      rows: [
        ["RM pool (unassigned)", verifiedRouting.rmQueue],
        ["Assigned to RM", verifiedRouting.assigned],
        ["Commission", verifiedRouting.commission],
        ["Portal only", verifiedRouting.portal],
      ],
    },
    {
      title: "Not interested breakdown",
      headers: ["State", "Count"],
      rows: [
        ["Awaiting uploader review", notInterestedBreakdown.pendingReview],
        ["Confirmed not interested", notInterestedBreakdown.confirmedNi],
        ["RM / Commission error", notInterestedBreakdown.rmError],
        ["Reopened", notInterestedBreakdown.reopen],
      ],
    },
    {
      title: `Period activity (${overviewDateRangeLabel(dateRange)})`,
      headers: ["Metric", "Count"],
      rows: [
        ["Added", mtd.added],
        ["Verified", mtd.verified],
        ["Rejected at verify (NI)", mtd.rejected],
        ["Not answering flagged", mtd.notAnswering],
        ["NI closed", mtd.niClosed],
        ["Deactivated", mtd.deactivated],
      ],
    },
    {
      title: "Queue backlog (current)",
      headers: ["Metric", "Count"],
      rows: [
        ["Pending feedback referrals", pendingReferrals],
        ["Re-verify tasks", reverifyTasks],
      ],
    },
    {
      title: `Team totals (${overviewDateRangeLabel(dateRange)})`,
      headers: ["Metric", "Value"],
      rows: [
        ["Added", staffTotals.added],
        ["Verified", staffTotals.verified],
        ["Rejected", staffTotals.rejected],
        ["Not answering", staffTotals.notAnswering],
        ["NI closed", staffTotals.niClosed],
        ["Deactivated", staffTotals.deactivated],
        ["Open tasks", staffTotals.openTasks],
        ["Overdue tasks", staffTotals.overdue],
        ["Calls", staffTotals.calls],
      ],
    },
    {
      title: "Team performance",
      headers: [
        "Member",
        "Added",
        "Verified",
        "Rejected",
        "Not answering",
        "NI closed",
        "Deactivated",
        "Open tasks",
        "Overdue",
        "Calls",
        "Talk min",
      ],
      rows: staff.map((row) => [
        row.name,
        row.addedMtd,
        row.verifiedMtd,
        row.rejectedMtd,
        row.notAnsweringMtd,
        row.niClosedMtd,
        row.deactivatedMtd,
        row.openTasks,
        row.overdueTasks,
        row.callsMtd,
        row.talkMinutesMtd,
      ]),
    },
    {
      title: "Pending verification queue",
      headers: ["Lead ID", "Bride", "City", "Phone", "Source", "Days waiting", "Added"],
      rows: pendingLeads.map((row) => [
        row.displayId,
        row.brideName,
        row.city,
        row.phone,
        row.source ?? "—",
        row.daysWaiting,
        row.createdAt.slice(0, 10),
      ]),
    },
  ];
}
