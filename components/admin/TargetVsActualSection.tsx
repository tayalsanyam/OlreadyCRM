"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { SetTargetsSlideOver } from "@/components/admin/SetTargetsSlideOver";
import { cn } from "@/lib/utils";
import type { BackendStaffRole, TargetRow } from "@/lib/targets";

type RoleTab = "all" | BackendStaffRole;

const ROLE_LABEL: Record<BackendStaffRole, string> = {
  regional_rm: "Regional",
  commission_rm: "Commission",
};

function pct(actual: number, target: number | null): number | null {
  if (target == null || target === 0) return null;
  return Math.round((actual / target) * 100);
}

function paceColor(p: number | null): string {
  if (p === null) return "text-slate-muted";
  if (p >= 100) return "text-emerald-600";
  if (p >= 70) return "text-amber-600";
  return "text-red-600";
}

function barColor(p: number | null): string {
  if (p === null) return "bg-slate-300";
  if (p >= 100) return "bg-emerald-500";
  if (p >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function TargetCell({
  actual,
  target,
  suffix = "",
}: {
  actual: number;
  target: number | null;
  suffix?: string;
}) {
  const p = pct(actual, target);
  const width = p != null ? Math.min(p, 100) : 0;
  return (
    <div className="min-w-[88px]">
      <p className="text-sm font-medium tabular-nums">
        {actual}
        {suffix}
        {target != null ? (
          <span className="text-slate-muted"> / {target}</span>
        ) : (
          <span className="text-slate-muted"> · no target</span>
        )}
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", barColor(p))} style={{ width: `${width}%` }} />
      </div>
      {p != null && <p className={cn("mt-0.5 text-[10px] font-medium", paceColor(p))}>{p}%</p>}
    </div>
  );
}

export function TargetVsActualSection({
  month,
  monthLabel,
}: {
  month?: string;
  monthLabel?: string;
}) {
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [tab, setTab] = useState<RoleTab>("all");

  const load = useCallback(() => {
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    void fetch(`/api/admin/targets${qs}`)
      .then((r) => r.json())
      .then((json: { data: TargetRow[] }) => setRows(json.data ?? []));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    return rows.filter((r) => r.role === tab);
  }, [rows, tab]);

  const totals = useMemo(() => {
    const slice = filtered;
    return {
      bookings: slice.reduce((n, r) => n + r.actualBookings, 0),
      pushes: slice.reduce((n, r) => n + r.actualPushCount, 0),
      leads: slice.reduce((n, r) => n + r.actualLeadsWorked, 0),
      targetBookings: slice.reduce((n, r) => n + (r.targetBookings ?? 0), 0),
      commission: slice.reduce((n, r) => n + r.actualCommissionCollected, 0),
      targetCommission: slice.reduce((n, r) => n + (r.targetCommission ?? 0), 0),
    };
  }, [filtered]);

  const showCommission = tab === "commission_rm" || tab === "all";

  const regional = rows.filter((r) => r.role === "regional_rm");
  const commission = rows.filter((r) => r.role === "commission_rm");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand">
            {monthLabel ? `${monthLabel} — performance & targets` : "This month — performance & targets"}
          </h2>
          <p className="text-xs text-slate-muted">
            Bookings, pushes, leads worked, and conversion vs monthly targets. Booked counts exclude
            cancelled bookings.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setTargetsOpen(true)}>
          Set targets
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", `All (${rows.length})`],
            ["regional_rm", `Regional (${regional.length})`],
            ["commission_rm", `Commission (${commission.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              tab === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted hover:bg-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
          <span className="text-slate-muted">Booked </span>
          <span className="font-semibold text-brand">{totals.bookings}</span>
          {totals.targetBookings > 0 && (
            <span className="text-slate-muted"> / {totals.targetBookings} target</span>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
          <span className="text-slate-muted">Pushes </span>
          <span className="font-semibold text-brand">{totals.pushes}</span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
          <span className="text-slate-muted">Leads worked </span>
          <span className="font-semibold text-brand">{totals.leads}</span>
        </div>
        {showCommission && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
            <span className="text-slate-muted">Commission collected </span>
            <span className="font-semibold text-brand">
              ₹{Math.round(totals.commission).toLocaleString("en-IN")}
            </span>
            {totals.targetCommission > 0 && (
              <span className="text-slate-muted">
                {" "}
                / ₹{Math.round(totals.targetCommission).toLocaleString("en-IN")} target
              </span>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <Table>
          <THead>
            <TR>
              <TH>Team member</TH>
              <TH>Bookings</TH>
              <TH>Pushes</TH>
              <TH>Leads worked</TH>
              {showCommission && <TH>Commission</TH>}
              <TH>Conv.</TH>
              <TH>Avg MUAs</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.length === 0 ? (
              <TR>
                <TD colSpan={showCommission ? 7 : 6} className="py-8 text-center text-slate-muted">
                  No staff in this view
                </TD>
              </TR>
            ) : (
              filtered.map((rm) => (
                <TR key={rm.staffId} className="hover:bg-slate-50/80">
                  <TD>
                    <p className="font-medium">{rm.staffName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant={rm.role === "commission_rm" ? "muted" : "default"}>
                        {ROLE_LABEL[rm.role]}
                      </Badge>
                      {rm.region && (
                        <span className="text-xs capitalize text-slate-muted">{rm.region}</span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <TargetCell actual={rm.actualBookings} target={rm.targetBookings} />
                  </TD>
                  <TD>
                    <p className="text-sm font-semibold tabular-nums text-brand">{rm.actualPushCount}</p>
                    <p className="text-[10px] text-slate-muted">{monthLabel ?? "this month"}</p>
                  </TD>
                  <TD>
                    <TargetCell actual={rm.actualLeadsWorked} target={rm.targetLeadsWorked} />
                  </TD>
                  {showCommission && (
                    <TD>
                      {rm.role === "commission_rm" ? (
                        <TargetCell
                          actual={Math.round(rm.actualCommissionCollected)}
                          target={rm.targetCommission}
                          suffix=" ₹"
                        />
                      ) : (
                        <span className="text-xs text-slate-muted">—</span>
                      )}
                    </TD>
                  )}
                  <TD>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        rm.conversionPct >= 25
                          ? "text-emerald-600"
                          : rm.conversionPct > 0
                            ? "text-amber-600"
                            : "text-slate-muted",
                      )}
                    >
                      {rm.conversionPct}%
                    </p>
                    <p className="text-[10px] text-slate-muted">booked ÷ leads</p>
                  </TD>
                  <TD>
                    <TargetCell
                      actual={rm.actualAvgMuasPerLead}
                      target={rm.targetAvgMuasPerLead}
                    />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      <SetTargetsSlideOver
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        onSaved={() => {
          load();
          setTargetsOpen(false);
        }}
        staff={rows.map((r) => ({
          id: r.staffId,
          name: r.staffName,
          role: r.role,
        }))}
      />
    </div>
  );
}
