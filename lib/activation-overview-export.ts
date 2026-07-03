import type { OverviewSection } from "@/lib/download-overview-csv";
import type { AdminActivationOverview } from "@/lib/admin-activation-overview-query";
import { overviewDateRangeLabel } from "@/lib/admin-overview-date-range";

export function buildActivationOverviewSections(data: AdminActivationOverview): OverviewSection[] {
  const { dateRange, summary, pending, staff } = data;
  const staffTotals = {
    activated: staff.reduce((n, s) => n + s.activatedMtd, 0),
    openTasks: staff.reduce((n, s) => n + s.openTasks, 0),
    overdue: staff.reduce((n, s) => n + s.overdueTasks, 0),
    calls: staff.reduce((n, s) => n + s.callsMtd, 0),
  };

  return [
    {
      title: `Activation overview — exported ${new Date().toLocaleString("en-IN")}`,
      rows: [["Date range", overviewDateRangeLabel(dateRange)]],
    },
    {
      title: "Pipeline snapshot (current)",
      headers: ["Metric", "Value"],
      rows: [
        ["Pending activation", summary.pendingActivation],
        ["Sent back", summary.sentBack],
        ["Avg days pending", summary.avgDaysPending],
        ["Pending 7+ days", summary.pendingOver7Days],
        ["Pending 14+ days", summary.pendingOver14Days],
        ["Overdue tasks", summary.overdueTasks],
        ["At invoice step", summary.atInvoiceStep],
        ["At contract step", summary.atContractStep],
      ],
    },
    {
      title: `Period activity (${overviewDateRangeLabel(dateRange)})`,
      headers: ["Metric", "Value"],
      rows: [
        ["Activated", summary.activatedMtd],
        ["Revenue", summary.revenueMtd],
      ],
    },
    {
      title: `Team totals (${overviewDateRangeLabel(dateRange)})`,
      headers: ["Metric", "Value"],
      rows: [
        ["Activated MTD", staffTotals.activated],
        ["Open tasks", staffTotals.openTasks],
        ["Overdue tasks", staffTotals.overdue],
        ["Calls MTD", staffTotals.calls],
      ],
    },
    {
      title: "Team performance",
      headers: [
        "Member",
        "Activated MTD",
        "Open tasks",
        "Overdue tasks",
        "Calls MTD",
        "Talk minutes",
      ],
      rows: staff.map((row) => [
        row.name,
        row.activatedMtd,
        row.openTasks,
        row.overdueTasks,
        row.callsMtd,
        row.talkMinutesMtd,
      ]),
    },
    {
      title: "Pending activation (top 50)",
      headers: [
        "MUA",
        "City",
        "Assignee",
        "Days pending",
        "Profile verified",
        "Invoice",
        "Contract",
        "Has contract file",
      ],
      rows: pending.map((row) => [
        row.muaName,
        row.muaCity,
        row.assignedSalesName ?? "—",
        row.daysPending,
        row.profileLinkVerified ? "Yes" : "No",
        row.invoiceGenerated ? "Yes" : "No",
        row.contractGenerated ? "Yes" : "No",
        row.hasContract ? "Yes" : "No",
      ]),
    },
  ];
}
