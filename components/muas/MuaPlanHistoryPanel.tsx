"use client";

import { Fragment, useCallback, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { MuaPlanPeriodDetailView } from "@/components/muas/MuaPlanPeriodDetailView";
import type { MuaPlanPeriodDetail } from "@/lib/mua-plan-period-detail-shared";
import { cn } from "@/lib/utils";
import type { MuaPlanHistoryRow, PlanTier } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

function statusBadge(row: MuaPlanHistoryRow) {
  if (row.planStatus === "current") {
    return <Badge variant="success">Current</Badge>;
  }
  if (row.planStatus === "expired" && row.isCurrent) {
    return <Badge variant="active">Current · expired</Badge>;
  }
  if (row.planStatus === "expired") {
    return <Badge variant="muted">Expired</Badge>;
  }
  return <Badge variant="muted">Past</Badge>;
}

export function MuaPlanHistoryPanel({
  muaId,
  history,
  currentPlanDetail = null,
  title = "All plans to date",
  compact = false,
}: {
  muaId: string;
  history: MuaPlanHistoryRow[];
  currentPlanDetail?: MuaPlanPeriodDetail | null;
  title?: string;
  compact?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, MuaPlanPeriodDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});

  const columnCount = compact ? 6 : 7;

  const loadDetail = useCallback(
    async (row: MuaPlanHistoryRow) => {
      if (row.isCurrent && currentPlanDetail) {
        setDetailCache((prev) =>
          prev[row.id] ? prev : { ...prev, [row.id]: currentPlanDetail }
        );
        return currentPlanDetail;
      }
      setLoadingId(row.id);
      setLoadErrors((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      const res = await fetch(
        `/api/muas/${muaId}/plan-history/${encodeURIComponent(row.id)}`
      );
      const json = (await res.json()) as {
        data: MuaPlanPeriodDetail | null;
        error?: string | null;
      };
      setLoadingId(null);
      if (!res.ok || !json.data) {
        setLoadErrors((prev) => ({
          ...prev,
          [row.id]: json.error ?? "Could not load plan details",
        }));
        return null;
      }
      setDetailCache((prev) => ({ ...prev, [row.id]: json.data! }));
      return json.data;
    },
    [currentPlanDetail, muaId]
  );

  async function toggleRow(row: MuaPlanHistoryRow) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (row.isCurrent && currentPlanDetail) {
      setDetailCache((prev) =>
        prev[row.id] ? prev : { ...prev, [row.id]: currentPlanDetail }
      );
      return;
    }
    if (!detailCache[row.id]) {
      await loadDetail(row);
    }
  }

  if (history.length === 0) {
    return (
      <Card className={cn("p-4", compact && "border-0 shadow-none p-0")}>
        {!compact ? <h2 className="mb-2 font-semibold text-brand">{title}</h2> : null}
        <p className="text-sm text-slate-muted">No plan history recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card className={cn("space-y-3 p-4", compact && "border-0 shadow-none p-0")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-brand">{title}</h2>
        <span className="text-xs text-slate-muted">
          {history.length} plan period{history.length === 1 ? "" : "s"} · click a row to expand
        </span>
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="w-8" />
            <TH>Plan</TH>
            <TH>Status</TH>
            <TH>Assigned</TH>
            <TH>Expires</TH>
            <TH>Assigned by</TH>
            {!compact ? <TH>Notes</TH> : null}
          </TR>
        </THead>
        <TBody>
          {history.map((h) => {
            const expanded = expandedId === h.id;
            const detail =
              detailCache[h.id] ??
              (h.isCurrent && currentPlanDetail ? currentPlanDetail : null);
            const loading = loadingId === h.id;
            const rowError = loadErrors[h.id];

            return (
              <Fragment key={h.id}>
                <TR
                  className={cn(
                    "cursor-pointer hover:bg-slate-50",
                    h.isCurrent && "bg-teal-50/50",
                    expanded && "bg-slate-50"
                  )}
                  onClick={() => void toggleRow(h)}
                >
                  <TD className="text-slate-muted">
                    <span aria-hidden className="inline-block text-xs">
                      {expanded ? "▼" : "▶"}
                    </span>
                  </TD>
                  <TD>
                    {h.planTier ? (
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          PLAN_BADGE[h.planTier]
                        )}
                      >
                        {PLAN_TIER_LABELS[h.planTier]}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-muted">Removed</span>
                    )}
                  </TD>
                  <TD>{statusBadge(h)}</TD>
                  <TD className="text-sm">{formatDate(h.assignedAt)}</TD>
                  <TD className="text-sm">{h.expiryAt ? formatDate(h.expiryAt) : "—"}</TD>
                  <TD className="text-sm">{h.assignedByName ?? "—"}</TD>
                  {!compact ? (
                    <TD className="max-w-xs text-xs text-slate-muted">{h.notes ?? "—"}</TD>
                  ) : null}
                </TR>
                {expanded ? (
                  <TR className="bg-slate-50/80">
                    <TD colSpan={columnCount} className="px-4 pb-4 pt-0">
                      {loading ? (
                        <p className="py-4 text-sm text-slate-muted">Loading plan details…</p>
                      ) : rowError && !detail ? (
                        <p className="py-4 text-sm text-red-600">{rowError}</p>
                      ) : detail ? (
                        <MuaPlanPeriodDetailView
                          detail={detail}
                          nested
                          heading={`Plan details · ${h.planTier ? PLAN_TIER_LABELS[h.planTier] : "Removed"}`}
                        />
                      ) : (
                        <p className="py-4 text-sm text-slate-muted">No details available.</p>
                      )}
                    </TD>
                  </TR>
                ) : null}
              </Fragment>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
