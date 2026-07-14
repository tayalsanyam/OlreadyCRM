import type { OverviewSection } from "@/lib/download-overview-csv";
import type { TargetRow } from "@/lib/targets";

const ROLE_LABEL = {
  regional_rm: "Regional RM",
  commission_rm: "Commission RM",
} as const;

type StaffRow = {
  name: string;
  role: "regional_rm" | "commission_rm";
  region: string | null;
  activeLeads: number;
  bookedMtd: number;
  pushesMtd: number;
  criticalUntouched: number;
  pendingConfirmation: number;
  overdueTasks: number;
  conversionRate: number;
  hasCallyzer: boolean;
  callsMtd: number;
  talkMinutesMtd: number;
  daysSinceLastCall: number | null;
};

type DashboardExportInput = {
  kpis: {
    activeLeads: number;
    commissionPipeline: number;
    criticalBand: number;
    approachingShift: number;
    bookingsMtd: number;
    activeLeadsDelta: number;
    bookingsMtdDelta: number;
  };
  summary: {
    regionalRmCount: number;
    commissionRmCount: number;
    commissionLeads: number;
  };
  callyzer?: {
    callsMtd: number;
    talkMinutesMtd: number;
    mappedStaff: number;
    staleStaff: number;
  };
  staffPortfolio: StaffRow[];
  targets: TargetRow[];
  tab: "all" | "regional_rm" | "commission_rm";
};

function tabLabel(tab: DashboardExportInput["tab"]): string {
  if (tab === "regional_rm") return "Regional";
  if (tab === "commission_rm") return "Commission";
  return "All";
}

function formatLastCall(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function formatAtRisk(row: StaffRow): string {
  const atRisk = row.role === "regional_rm" ? row.criticalUntouched : row.pendingConfirmation;
  const parts: string[] = [];
  if (atRisk > 0) parts.push(`${atRisk} risk`);
  if (row.overdueTasks > 0) parts.push(`${row.overdueTasks} overdue`);
  return parts.length ? parts.join(" · ") : "OK";
}

function formatCalls(row: StaffRow): string {
  if (!row.hasCallyzer) return "—";
  const last = formatLastCall(row.daysSinceLastCall);
  return last
    ? `${row.callsMtd} (${row.talkMinutesMtd}m · ${last})`
    : `${row.callsMtd} (${row.talkMinutesMtd}m)`;
}

export function buildBackendDashboardSections(input: DashboardExportInput): OverviewSection[] {
  const { kpis, summary, callyzer, staffPortfolio, targets, tab } = input;
  const filtered =
    tab === "all" ? staffPortfolio : staffPortfolio.filter((s) => s.role === tab);

  const targetFiltered =
    tab === "all" ? targets : targets.filter((t) => t.role === tab);

  const sections: OverviewSection[] = [
    {
      title: `Backend overview — exported ${new Date().toLocaleString("en-IN")}`,
      rows: [],
    },
    {
      title: "KPIs",
      headers: ["Metric", "Value", "Change", "Change context"],
      rows: [
        ["Active leads", kpis.activeLeads, kpis.activeLeadsDelta, "vs last week"],
        ["Commission pipeline", kpis.commissionPipeline, "", ""],
        ["Critical band", kpis.criticalBand, "", ""],
        ["Approaching shift", kpis.approachingShift, "", ""],
        ["Bookings MTD", kpis.bookingsMtd, kpis.bookingsMtdDelta, "vs last month"],
      ],
    },
    {
      title: "Summary",
      headers: ["Metric", "Value"],
      rows: [
        ["Regional RMs", summary.regionalRmCount],
        ["Commission RMs", summary.commissionRmCount],
        ["Leads with commission RM", summary.commissionLeads],
        ...(callyzer
          ? [
              ["Callyzer calls MTD", callyzer.callsMtd],
              ["Callyzer talk minutes MTD", callyzer.talkMinutesMtd],
              ["Callyzer mapped staff", callyzer.mappedStaff],
              ["Callyzer stale staff", callyzer.staleStaff],
            ]
          : []),
      ],
    },
    {
      title: `Workload at a glance (${tabLabel(tab)})`,
      headers: [
        "Name",
        "Role",
        "Region",
        "Active",
        "Booked MTD",
        "Pushes MTD",
        "Calls MTD",
        "Conv. %",
        "At risk",
      ],
      rows: filtered.map((row) => [
        row.name,
        ROLE_LABEL[row.role],
        row.region ?? "—",
        row.activeLeads,
        row.bookedMtd,
        row.pushesMtd,
        formatCalls(row),
        Math.round(row.conversionRate),
        formatAtRisk(row),
      ]),
    },
    {
      title: `This month — performance & targets (${tabLabel(tab)})`,
      headers: [
        "Team member",
        "Role",
        "Region",
        "Bookings actual",
        "Bookings target",
        "Bookings %",
        "Pushes",
        "Leads worked actual",
        "Leads worked target",
        "Leads %",
        "Conv. %",
        "Avg MUAs actual",
        "Avg MUAs target",
      ],
      rows: targetFiltered.map((r) => {
        const bookingsPct =
          r.targetBookings != null && r.targetBookings > 0
            ? Math.round((r.actualBookings / r.targetBookings) * 100)
            : "";
        const leadsPct =
          r.targetLeadsWorked != null && r.targetLeadsWorked > 0
            ? Math.round((r.actualLeadsWorked / r.targetLeadsWorked) * 100)
            : "";
        return [
          r.staffName,
          ROLE_LABEL[r.role],
          r.region ?? "—",
          r.actualBookings,
          r.targetBookings ?? "",
          bookingsPct,
          r.actualPushCount,
          r.actualLeadsWorked,
          r.targetLeadsWorked ?? "",
          leadsPct,
          r.conversionPct,
          r.actualAvgMuasPerLead,
          r.targetAvgMuasPerLead ?? "",
        ];
      }),
    },
  ];

  return sections;
}
