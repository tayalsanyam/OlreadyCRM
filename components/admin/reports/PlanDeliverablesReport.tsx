"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { AdminPlanTagCell } from "@/components/admin/AdminPlanTagCell";
import { PLAN_TIER_LABELS, type PlanTier } from "@/lib/types";
import {
  ADMIN_PLAN_TAG_LABELS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { ALL_REGIONS, REGION_OPTIONS } from "@/lib/mua-region";
import { cn, formatDate } from "@/lib/utils";

type DeliverableRow = {
  id: string;
  displayId: string;
  name: string;
  city: string;
  planTierLabel: string;
  adminPlanTag: AdminPlanTag | null;
  adminPlanTagLabel: string | null;
  planExpiry: string | null;
  planActivatedAt: string | null;
  planRmName: string | null;
  regionalRmName: string | null;
  salesRmName: string | null;
  lastContactAt: string | null;
  lastPushedAt: string | null;
  monthlyPushTarget: number | null;
  pushesThisMonth: number;
  totalPushes: number;
  pushesSincePlan: number;
  assuredBookings: number | null;
  totalBookings: number;
  totalBookingRevenue: number;
  weeklyCap: number | null;
  weeklyUsed: number;
  weeklyRemaining: number;
  planExpired: boolean;
  expiringWithin30Days: boolean;
  pushTargetMet: boolean;
  bookingTargetMet: boolean;
};

type Summary = {
  total: number;
  pushTargetMet: number;
  bookingTargetMet: number;
  planExpired: number;
  expiringWithin30Days: number;
};

type RmOption = { id: string; name: string };

const PLAN_OPTIONS = Object.keys(PLAN_TIER_LABELS) as PlanTier[];

function patchRowTag(
  rows: DeliverableRow[],
  muaId: string,
  adminPlanTag: AdminPlanTag | null
): DeliverableRow[] {
  return rows.map((r) =>
    r.id === muaId
      ? {
          ...r,
          adminPlanTag,
          adminPlanTagLabel: adminPlanTag ? ADMIN_PLAN_TAG_LABELS[adminPlanTag] : null,
        }
      : r
  );
}

export function PlanDeliverablesReport() {
  const [rows, setRows] = useState<DeliverableRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [search, setSearch] = useState("");
  const [planRmId, setPlanRmId] = useState("");
  const [regionalRmId, setRegionalRmId] = useState("");
  const [tier, setTier] = useState("");
  const [nearExpiry, setNearExpiry] = useState(false);
  const [state, setState] = useState("");
  const [region, setRegion] = useState("");
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [regionalRms, setRegionalRms] = useState<RmOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fetch("/api/admin/rms").then((r) => r.json()),
      fetch("/api/cities")
        .then((r) => r.json())
        .then((json: { data?: Array<{ state?: string | null }> }) => {
          const set = new Set<string>();
          for (const row of json.data ?? []) {
            if (row.state?.trim()) set.add(row.state.trim());
          }
          setStateOptions([...set].sort((a, b) => a.localeCompare(b, "en-IN")));
        }),
    ]).then(([regionalJson]) => {
      setRegionalRms((regionalJson as { data: RmOption[] }).data ?? []);
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (planRmId) params.set("planRmId", planRmId);
    if (regionalRmId) params.set("regionalRmId", regionalRmId);
    if (tier) params.set("tier", tier);
    if (nearExpiry) params.set("nearExpiry", "true");
    if (state) params.set("state", state);
    if (region) params.set("region", region);
    void fetch(`/api/admin/reports/plan-deliverables?${params}`)
      .then((r) => r.json())
      .then(
        (json: { data: { rows: DeliverableRow[]; summary: Summary } | null }) => {
          setRows(json.data?.rows ?? []);
          setSummary(json.data?.summary ?? null);
        }
      )
      .finally(() => setLoading(false));
  }, [search, planRmId, regionalRmId, tier, nearExpiry, state, region]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRowTag = useCallback((muaId: string, adminPlanTag: AdminPlanTag | null) => {
    setRows((prev) => patchRowTag(prev, muaId, adminPlanTag));
  }, []);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: "csv" });
    if (search.trim()) params.set("search", search.trim());
    if (planRmId) params.set("planRmId", planRmId);
    if (regionalRmId) params.set("regionalRmId", regionalRmId);
    if (tier) params.set("tier", tier);
    if (nearExpiry) params.set("nearExpiry", "true");
    if (state) params.set("state", state);
    if (region) params.set("region", region);
    return `/api/admin/reports/plan-deliverables?${params}`;
  }, [search, planRmId, regionalRmId, tier, nearExpiry, state, region]);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">Plan deliverables</h2>
            <p className="text-sm text-slate-muted">
              On-plan MUAs — push and booking deliverables since plan activation, with revenue
            </p>
          </div>
          <a
            href={exportHref}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-brand hover:bg-slate-50"
          >
            Export CSV ↓
          </a>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input
            label="MUA name or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="min-w-[180px]"
          />
          <label className="text-sm">
            Plan RM
            <select
              className="mt-1 block min-w-[140px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={planRmId}
              onChange={(e) => setPlanRmId(e.target.value)}
            >
              <option value="">All</option>
              {regionalRms.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Regional RM
            <select
              className="mt-1 block min-w-[140px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={regionalRmId}
              onChange={(e) => setRegionalRmId(e.target.value)}
            >
              <option value="">All</option>
              {regionalRms.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            State
            <select
              className="mt-1 block min-w-[140px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">All states</option>
              {stateOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Region
            <select
              className="mt-1 block min-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">All regions</option>
              {ALL_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_OPTIONS.find((o) => o.value === r)?.label ?? r}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Plan tier
            <select
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
            >
              <option value="">All plans</option>
              {PLAN_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {PLAN_TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={nearExpiry}
              onChange={(e) => setNearExpiry(e.target.checked)}
            />
            Expiring within 30 days
          </label>
          <Button size="sm" variant="secondary" onClick={load} className="self-end">
            Apply
          </Button>
        </div>
      </Card>

      {summary && (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <span>On-plan MUAs: {summary.total}</span>
          <span>Push target met: {summary.pushTargetMet}</span>
          <span>Booking target met: {summary.bookingTargetMet}</span>
          <span>Expiring &lt;30 days: {summary.expiringWithin30Days}</span>
          <span>Plan expired: {summary.planExpired}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>Plan</TH>
              <TH>Admin tag</TH>
              <TH>Expiry</TH>
              <TH>Current RM</TH>
              <TH>Sales RM</TH>
              <TH>Plan RM</TH>
              <TH>Last contact</TH>
              <TH>Last push</TH>
              <TH>Pushes / month</TH>
              <TH>Since plan</TH>
              <TH>Total pushes</TH>
              <TH>Bookings</TH>
              <TH>Revenue</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD colSpan={15} className="py-8 text-center text-slate-muted">
                  Loading…
                </TD>
              </TR>
            ) : rows.length === 0 ? (
              <TR>
                <TD colSpan={15} className="py-8 text-center text-slate-muted">
                  No on-plan MUAs match these filters
                </TD>
              </TR>
            ) : (
              rows.map((r) => (
                <TR
                  key={r.id}
                  className={cn(
                    r.planExpired && "bg-slate-50",
                    r.expiringWithin30Days && !r.planExpired && "bg-amber-50/80",
                    !r.pushTargetMet && !r.planExpired && !r.expiringWithin30Days && "bg-amber-50/50"
                  )}
                >
                  <TD>
                    <Link
                      href={`/admin/muas/${r.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-slate-muted">
                      {r.displayId} · {r.city}
                    </p>
                  </TD>
                  <TD>
                    <Badge>{r.planTierLabel}</Badge>
                  </TD>
                  <TD>
                    <AdminPlanTagCell
                      muaId={r.id}
                      tag={r.adminPlanTag}
                      onUpdated={(adminPlanTag) => updateRowTag(r.id, adminPlanTag)}
                    />
                  </TD>
                  <TD className="text-sm">
                    {r.planExpiry ? formatDate(r.planExpiry) : "—"}
                    {r.planExpired && (
                      <Badge variant="muted" className="ml-1">
                        Expired
                      </Badge>
                    )}
                    {r.expiringWithin30Days && !r.planExpired && (
                      <Badge variant="hot" className="ml-1">
                        &lt;30d
                      </Badge>
                    )}
                    {r.planActivatedAt && (
                      <span className="block text-xs text-slate-muted">
                        Since {formatDate(r.planActivatedAt.slice(0, 10))}
                      </span>
                    )}
                  </TD>
                  <TD className="text-sm">{r.regionalRmName ?? "—"}</TD>
                  <TD className="text-sm">{r.salesRmName ?? "—"}</TD>
                  <TD className="text-sm">{r.planRmName ?? "—"}</TD>
                  <TD className="whitespace-nowrap text-sm">
                    {r.lastContactAt ? formatDate(r.lastContactAt.slice(0, 10)) : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-sm">
                    {r.lastPushedAt ? formatDate(r.lastPushedAt.slice(0, 10)) : "—"}
                  </TD>
                  <TD>
                    <span
                      className={cn(
                        "font-medium",
                        r.pushTargetMet ? "text-emerald-700" : "text-amber-700"
                      )}
                    >
                      {r.pushesThisMonth}
                    </span>
                    <span className="text-slate-muted">
                      {" "}
                      / {r.monthlyPushTarget ?? "—"}
                    </span>
                  </TD>
                  <TD>
                    <span className="font-medium">{r.pushesSincePlan}</span>
                    <span className="block text-xs text-slate-muted">since activation</span>
                  </TD>
                  <TD>{r.totalPushes}</TD>
                  <TD>
                    <span
                      className={cn(
                        "font-medium",
                        r.bookingTargetMet ? "text-emerald-700" : "text-amber-700"
                      )}
                    >
                      {r.totalBookings}
                    </span>
                    <span className="text-slate-muted">
                      {" "}
                      / {r.assuredBookings ?? "—"}
                    </span>
                  </TD>
                  <TD className="font-medium">
                    Rs. {r.totalBookingRevenue.toLocaleString("en-IN")}
                  </TD>
                  <TD>
                    {r.pushTargetMet && r.bookingTargetMet ? (
                      <Badge variant="success">On track</Badge>
                    ) : (
                      <Badge variant="hot">Needs attention</Badge>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
