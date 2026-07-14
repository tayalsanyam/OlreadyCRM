import type { AdminSalesFilterValues } from "@/components/admin/sales/AdminSalesFilters";
import type { OverviewSection } from "@/lib/download-overview-csv";

const ROLE_LABEL: Record<string, string> = {
  sales_rm: "Sales RM",
  sales_tl: "Team lead",
};

type MemberRow = {
  name: string;
  role: string;
  teamName: string | null;
  activePipeline: number;
  confirmStage: number;
  dealsClosedMtd: number;
  revenueMtd: number;
  targetRevenue: number | null;
  targetPotentialSold: number | null;
  targetExistingSold: number | null;
  targetSoldTotal: number | null;
  revenuePct: number | null;
  soldPct: number | null;
  callsMtd: number;
  talkMinutesMtd: number;
  overdueTasks: number;
};

type SalesExportInput = {
  month: string;
  filters: AdminSalesFilterValues;
  teamTabLabel: string;
  stats: {
    totalPipeline: number;
    unassigned: number;
    potential: number;
    renewal: number;
    reEngage: number;
    confirm: number;
    closed: number;
    revenue: number;
    closeRate: number;
  };
  memberTotals: {
    pipeline: number;
    closed: number;
    revenue: number;
    calls: number;
    overdue: number;
  };
  members: MemberRow[];
  funnel: Array<{ stage?: string; total?: number; conversionPct?: number }>;
  source: Array<{ source?: string; total?: number }>;
  callsByDay: Array<{ day: string; calls: number }>;
};

function filterSummary(filters: AdminSalesFilterValues): string[] {
  const parts: string[] = [];
  if (filters.dateFrom) parts.push(`From ${filters.dateFrom}`);
  if (filters.dateTo) parts.push(`To ${filters.dateTo}`);
  if (filters.stage) parts.push(`Stage: ${filters.stage}`);
  if (filters.muaType) parts.push(`MUA type: ${filters.muaType}`);
  if (filters.source) parts.push(`Source: ${filters.source}`);
  if (filters.city) parts.push(`City: ${filters.city}`);
  if (filters.assignedTo) parts.push(`Assignee filter: ${filters.assignedTo}`);
  if (filters.teamId) parts.push(`Team filter: ${filters.teamId}`);
  if (filters.q.trim()) parts.push(`Search: ${filters.q.trim()}`);
  return parts.length ? parts : ["No filters applied"];
}

function formatTarget(row: MemberRow): string {
  if (row.targetRevenue == null || row.targetRevenue <= 0) return "No target";
  const deals =
    row.targetSoldTotal != null && row.targetSoldTotal > 0
      ? ` · ${row.dealsClosedMtd}/${row.targetSoldTotal} deals (${row.soldPct ?? 0}%)`
      : "";
  return `${row.revenuePct ?? 0}% · ₹${row.revenueMtd} / ₹${row.targetRevenue}${deals}`;
}

export function buildSalesOverviewSections(input: SalesExportInput): OverviewSection[] {
  const { month, filters, teamTabLabel, stats, memberTotals, members, funnel, source, callsByDay } =
    input;

  return [
    {
      title: `Sales overview — exported ${new Date().toLocaleString("en-IN")}`,
      rows: [["Month", month], ...filterSummary(filters).map((f) => ["Filter", f])],
    },
    {
      title: "Pipeline summary (filtered)",
      headers: ["Metric", "Value"],
      rows: [
        ["Pipeline (filtered)", stats.totalPipeline],
        ["Unassigned", stats.unassigned],
        ["Potential MUAs", stats.potential],
        ["Renewal (T-30)", stats.renewal],
        ["Re-engage", stats.reEngage],
        ["Confirm", stats.confirm],
        ["Deals closed", stats.closed],
        ["Close rate %", stats.closeRate],
        ["Revenue", stats.revenue],
      ],
    },
    {
      title: `Team performance totals (${teamTabLabel})`,
      headers: ["Metric", "Value"],
      rows: [
        ["Active pipeline", memberTotals.pipeline],
        ["Closed MTD", memberTotals.closed],
        ["Revenue MTD", memberTotals.revenue],
        ["Calls MTD", memberTotals.calls],
        ["Overdue tasks", memberTotals.overdue],
      ],
    },
    {
      title: `Team performance at a glance (${teamTabLabel})`,
      headers: [
        "Member",
        "Role",
        "Team",
        "Pipeline",
        "Confirm",
        "Closed MTD",
        "Revenue MTD",
        "Target progress",
        "Calls MTD",
        "Talk minutes",
        "Overdue tasks",
      ],
      rows: members.map((row) => [
        row.name,
        ROLE_LABEL[row.role] ?? row.role,
        row.teamName ?? "—",
        row.activePipeline,
        row.confirmStage,
        row.dealsClosedMtd,
        row.revenueMtd,
        formatTarget(row),
        row.callsMtd,
        row.talkMinutesMtd,
        row.overdueTasks,
      ]),
    },
    {
      title: "Conversion funnel",
      headers: ["Stage", "Total", "Conversion %"],
      rows: funnel.map((r) => [r.stage ?? "", r.total ?? 0, r.conversionPct ?? ""]),
    },
    {
      title: "Source mix",
      headers: ["Source", "Total"],
      rows: source.slice(0, 6).map((r) => [r.source ?? "", r.total ?? 0]),
    },
    {
      title: "Call activity (last 14 days)",
      headers: ["Day", "Calls"],
      rows: callsByDay.map((r) => [r.day, r.calls]),
    },
  ];
}
