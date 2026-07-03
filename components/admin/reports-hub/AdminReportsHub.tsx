"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LeadJourneyReport } from "@/components/admin/reports/LeadJourneyReport";
import { FinancialReport } from "@/components/admin/reports/FinancialReport";
import { CustomReportBuilder } from "@/components/admin/reports/CustomReportBuilder";
import { IntakePerformanceReport } from "@/components/reports/IntakePerformanceReport";
import { RmLeadOverviewReport } from "@/components/admin/reports-hub/RmLeadOverviewReport";
import { MuaReportsSection } from "@/components/admin/reports-hub/MuaReportsSection";
import { TargetVsActualSection } from "@/components/admin/TargetVsActualSection";
import { StaffActivityReport } from "@/components/admin/reports-hub/StaffActivityReport";
import { ReportTabBar } from "@/components/admin/reports-hub/shared/ReportTabBar";
import type { AdminReportTabId } from "@/lib/admin-reports-config";
import {
  buildAdminReportsHubUrl,
  parseAdminReportsHubState,
  type AdminReportMuaSubTab,
} from "@/lib/admin-reports-hub-url";
import { currentMonthKey } from "@/lib/targets";
import { Input } from "@/components/ui/Input";

function AdminReportsHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ledgerSearchFromUrl = searchParams.get("search") ?? "";

  const [tab, setTab] = useState<AdminReportTabId>(() =>
    parseAdminReportsHubState(searchParams).tab
  );
  const [muaSub, setMuaSub] = useState<AdminReportMuaSubTab>(() =>
    parseAdminReportsHubState(searchParams).muaSub
  );
  const [performanceMonth, setPerformanceMonth] = useState(currentMonthKey());

  const performanceMonthLabel = useMemo(() => {
    const [y, m] = performanceMonth.split("-").map(Number);
    if (!y || !m) return performanceMonth;
    return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  }, [performanceMonth]);

  useEffect(() => {
    const state = parseAdminReportsHubState(searchParams);
    setTab(state.tab);
    setMuaSub(state.muaSub);
  }, [searchParams]);

  const pushUrl = useCallback(
    (nextTab: AdminReportTabId, nextMuaSub: AdminReportMuaSubTab = muaSub) => {
      router.replace(buildAdminReportsHubUrl(nextTab, nextMuaSub), { scroll: false });
    },
    [router, muaSub]
  );

  const updateTab = useCallback(
    (nextTab: AdminReportTabId) => {
      setTab(nextTab);
      pushUrl(nextTab);
    },
    [pushUrl]
  );

  const updateMuaSub = useCallback(
    (next: AdminReportMuaSubTab) => {
      setMuaSub(next);
      pushUrl("mua", next);
    },
    [pushUrl]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-brand">Reports</h1>
        <p className="text-sm text-slate-muted">
          Staff activity, lead pipeline, RM performance with targets, financials, and MUA
        </p>
      </div>

      <ReportTabBar tab={tab} onTabChange={updateTab} />

      {tab === "activity" ? <StaffActivityReport /> : null}
      {tab === "rmOverview" ? <RmLeadOverviewReport /> : null}
      {tab === "leadJourney" ? <LeadJourneyReport /> : null}
      {tab === "intake" ? <IntakePerformanceReport /> : null}
      {tab === "performance" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[10rem]">
              <label className="mb-1 block text-xs text-slate-muted">Month</label>
              <Input
                type="month"
                value={performanceMonth}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next) setPerformanceMonth(next);
                }}
              />
            </div>
          </div>
          <TargetVsActualSection month={performanceMonth} monthLabel={performanceMonthLabel} />
        </div>
      ) : null}
      {tab === "financial" ? <FinancialReport /> : null}
      {tab === "mua" ? (
        <MuaReportsSection
          subTab={muaSub}
          onSubTabChange={updateMuaSub}
          ledgerSearch={ledgerSearchFromUrl}
        />
      ) : null}
      {tab === "custom" ? (
        <CustomReportBuilder title="Custom report" apiBase="/api/admin/reports/custom" />
      ) : null}
    </div>
  );
}

function ReportsFallback() {
  return <div className="h-48 animate-pulse rounded-xl bg-slate-200" />;
}

export function AdminReportsHub() {
  return (
    <Suspense fallback={<ReportsFallback />}>
      <AdminReportsHubInner />
    </Suspense>
  );
}
