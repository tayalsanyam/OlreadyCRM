import type { AdminReportTabId } from "@/lib/admin-reports-config";

export type AdminReportMuaSubTab = "ledger" | "revenue" | "planDeliverables";

const LEGACY_TAB_MIGRATION: Record<
  string,
  { tab: AdminReportTabId; muaSub?: AdminReportMuaSubTab }
> = {
  revenue: { tab: "mua", muaSub: "revenue" },
  commission: { tab: "mua", muaSub: "revenue" },
  muaLedger: { tab: "mua", muaSub: "ledger" },
  muaRevenue: { tab: "mua", muaSub: "revenue" },
  planDeliverables: { tab: "mua", muaSub: "planDeliverables" },
  customerSummary: { tab: "performance" },
  niLeads: { tab: "activity" },
  calls: { tab: "activity" },
  callActivity: { tab: "activity" },
};

export function parseAdminReportHubTab(raw: string | null): AdminReportTabId {
  if (raw && LEGACY_TAB_MIGRATION[raw]) return LEGACY_TAB_MIGRATION[raw].tab;
  const allowed: AdminReportTabId[] = [
    "activity",
    "rmOverview",
    "leadJourney",
    "intake",
    "performance",
    "financial",
    "mua",
    "custom",
  ];
  if (raw && allowed.includes(raw as AdminReportTabId)) {
    return raw as AdminReportTabId;
  }
  return "activity";
}

export function parseAdminReportMuaSubTab(
  raw: string | null,
  legacyTab: string | null = null,
): AdminReportMuaSubTab {
  if (raw === "revenue" || raw === "planDeliverables") return raw;
  const legacy = legacyTab ? LEGACY_TAB_MIGRATION[legacyTab] : undefined;
  if (legacy?.muaSub) return legacy.muaSub;
  return "ledger";
}

export function parseAdminReportsHubState(searchParams: {
  get: (key: string) => string | null;
}) {
  const legacyTab = searchParams.get("tab");
  const tab = parseAdminReportHubTab(legacyTab);
  const muaSub = parseAdminReportMuaSubTab(searchParams.get("mua"), legacyTab);
  return { tab, muaSub };
}

export function buildAdminReportsHubUrl(
  tab: AdminReportTabId,
  muaSub: AdminReportMuaSubTab = "ledger",
): string {
  const p = new URLSearchParams();
  if (tab !== "activity") p.set("tab", tab);
  if (tab === "mua" && muaSub !== "ledger") p.set("mua", muaSub);
  const qs = p.toString();
  return qs ? `/admin/reports?${qs}` : "/admin/reports";
}
