/** Admin Reports hub tab definitions — single source for routing labels. */
export const ADMIN_REPORT_TABS = [
  { id: "activity", label: "Staff activity", api: "/api/admin/reports/activity" },
  { id: "rmOverview", label: "RM portfolio", api: "/api/admin/reports/rm-lead-overview" },
  { id: "leadJourney", label: "Lead journey", api: "/api/admin/reports/lead-journey" },
  { id: "intake", label: "Intake", api: "/api/admin/reports/intake" },
  { id: "performance", label: "Performance", api: "/api/admin/reports/performance" },
  { id: "financial", label: "Financial", api: "/api/admin/reports/financial" },
  { id: "mua", label: "MUA", api: "/api/admin/reports/mua-ledger" },
  { id: "custom", label: "Custom report", api: "/api/admin/reports/custom" },
] as const;

export type AdminReportTabId = (typeof ADMIN_REPORT_TABS)[number]["id"];

/** @deprecated use AdminReportTabId */
export type AdminReportHubTabId = AdminReportTabId;
