"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { PLAN_TIER_LABELS, type PlanTier } from "@/lib/types";
import { SALES_PLAN_TIERS } from "@/lib/sales-targets";

export type AdminTargetMemberRow = {
  userId: string;
  salesperson: string;
  teamName: string | null;
  targetRevenue: number;
  actualRevenue: number;
  targetPotentialCalls: number;
  actualPotentialCalls: number;
  targetPotentialSold: number;
  actualPotentialSold: number;
  targetExistingCalls: number;
  actualExistingCalls: number;
  targetExistingSold: number;
  actualExistingSold: number;
  targetSoldTotal: number;
  actualDealsClosed: number;
  planTargets?: Record<string, number> | null;
  planSold?: Record<string, number> | null;
};

export type AdminTargetClosedDealRow = {
  muaName: string;
  salesperson: string;
  planTier: string | null;
  planLabel: string;
  amount: number;
  closedAt: string;
};

export type AdminTargetTrackingPayload = {
  month: string;
  overview: {
    targetRevenue: number;
    actualRevenue: number;
    targetSoldTotal: number;
    actualDealsClosed: number;
    targetPotentialSold: number;
    actualPotentialSold: number;
    targetExistingSold: number;
    actualExistingSold: number;
    planTargets: Record<string, number>;
    planSold: Record<string, number>;
  };
  members: AdminTargetMemberRow[];
  closedDeals: AdminTargetClosedDealRow[];
};

function pct(actual: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.max(0, Math.round((actual / target) * 100));
}

function pctClass(p: number | null): string {
  if (p == null) return "text-slate-muted";
  if (p >= 80) return "text-emerald-700 font-semibold";
  if (p >= 50) return "text-amber-700 font-semibold";
  return "text-red-700 font-semibold";
}

function progressBarClass(p: number): string {
  if (p >= 80) return "bg-emerald-600";
  if (p >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function tierLabel(tier: string): string {
  return PLAN_TIER_LABELS[tier as PlanTier] ?? tier;
}

function pctCell(actual: number, target: number): string {
  if (target <= 0) return `${actual} / —`;
  const p = Math.round((actual / target) * 100);
  return `${actual} / ${target} (${p}%)`;
}

function OverviewCard({
  label,
  actual,
  target,
  format = "number",
}: {
  label: string;
  actual: number;
  target: number;
  format?: "number" | "currency";
}) {
  const p = pct(actual, target);
  const actualDisplay =
    format === "currency" ? `₹${actual.toLocaleString("en-IN")}` : String(actual);
  const targetDisplay =
    target > 0
      ? format === "currency"
        ? `₹${target.toLocaleString("en-IN")}`
        : String(target)
      : "—";

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-brand">{actualDisplay}</p>
      <p className="text-xs text-slate-muted">
        Target {targetDisplay}
        {p != null ? ` · ${p}%` : ""}
      </p>
      {p != null ? (
        <div className="mt-2 h-2 rounded-full bg-slate-100">
          <div
            className={`h-2 rounded-full ${progressBarClass(p)}`}
            style={{ width: `${Math.min(p, 100)}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}

export function AdminSalesTargetTracking({
  data,
  loading,
  loadError,
}: {
  data: AdminTargetTrackingPayload | null;
  loading: boolean;
  loadError: string | null;
}) {
  const overview = data?.overview;
  const members = data?.members ?? [];
  const closedDeals = data?.closedDeals ?? [];
  const planTiers = SALES_PLAN_TIERS.filter(
    (tier) =>
      (overview?.planTargets[tier] ?? 0) > 0 ||
      (overview?.planSold[tier] ?? 0) > 0 ||
      members.some(
        (m) => (m.planTargets?.[tier] ?? 0) > 0 || (m.planSold?.[tier] ?? 0) > 0,
      ),
  );

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-muted">Loading target tracking…</p>
      </Card>
    );
  }

  if (loadError) return null;

  if (!members.length) {
    return (
      <Card>
        <p className="text-sm text-slate-muted">No active sales staff match the current filters.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-muted">
        Tracks every field set under{" "}
        <Link href="/admin/sales/targets" className="font-medium text-accent hover:underline">
          Sales targets
        </Link>
        . Total deals = Potential sold + Existing sold. Revenue uses payment month; closes use close date.
      </p>

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OverviewCard
            label="Revenue"
            actual={overview.actualRevenue}
            target={overview.targetRevenue}
            format="currency"
          />
          <OverviewCard
            label="Deals closed (total)"
            actual={overview.actualDealsClosed}
            target={overview.targetSoldTotal}
          />
          <OverviewCard
            label="Potential closed"
            actual={overview.actualPotentialSold}
            target={overview.targetPotentialSold}
          />
          <OverviewCard
            label="Existing closed"
            actual={overview.actualExistingSold}
            target={overview.targetExistingSold}
          />
        </div>
      ) : null}

      {planTiers.length > 0 && overview ? (
        <Card>
          <p className="mb-3 text-sm font-semibold text-brand">Plan-tier targets (team)</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {planTiers.map((tier) => {
              const target = overview.planTargets[tier] ?? 0;
              const actual = overview.planSold[tier] ?? 0;
              const p = pct(actual, target);
              return (
                <div key={tier} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">{tierLabel(tier)}</p>
                  <p className="text-lg font-semibold text-brand">
                    {actual} / {target > 0 ? target : "—"}
                  </p>
                  {p != null ? (
                    <>
                      <p className="text-[11px] text-slate-muted">{p}% of target</p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-200">
                        <div
                          className={`h-1.5 rounded-full ${progressBarClass(p)}`}
                          style={{ width: `${Math.min(p, 100)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-muted">No target set</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="border-dashed">
          <p className="text-sm text-slate-muted">
            No plan-tier targets for this month. Set Privy / Phoenix / etc. columns under{" "}
            <Link href="/admin/sales/targets" className="font-medium text-accent hover:underline">
              Sales targets
            </Link>
            .
          </p>
        </Card>
      )}

      <Card>
        <p className="mb-2 text-sm font-semibold text-brand">Salesperson progress</p>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Salesperson</TH>
                <TH>Team</TH>
                <TH>Revenue target</TH>
                <TH>Actual revenue</TH>
                <TH>Revenue %</TH>
                <TH>Revenue progress</TH>
                <TH>Sold target</TH>
                <TH>Actual closed</TH>
                <TH>Sold %</TH>
                <TH>Potential</TH>
                <TH>Existing</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((r) => {
                const rt = Number(r.targetRevenue ?? 0);
                const ra = Number(r.actualRevenue ?? 0);
                const st = Number(r.targetSoldTotal ?? 0);
                const sa = Number(r.actualDealsClosed ?? 0);
                const rp = pct(ra, rt);
                const sp = pct(sa, st);
                return (
                  <TR key={r.userId}>
                    <TD className="font-medium">{r.salesperson}</TD>
                    <TD>{r.teamName ?? "—"}</TD>
                    <TD>{rt > 0 ? `₹${rt.toLocaleString("en-IN")}` : "—"}</TD>
                    <TD>₹{ra.toLocaleString("en-IN")}</TD>
                    <TD className={pctClass(rp)}>{rp != null ? `${rp}%` : "—"}</TD>
                    <TD>
                      {rp != null ? (
                        <div className="h-2 w-28 rounded bg-slate-100">
                          <div
                            className={`h-2 rounded ${progressBarClass(rp)}`}
                            style={{ width: `${Math.min(rp, 100)}%` }}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-muted">No target</span>
                      )}
                    </TD>
                    <TD>{st > 0 ? st : "—"}</TD>
                    <TD>{sa}</TD>
                    <TD className={pctClass(sp)}>{sp != null ? `${sp}%` : "—"}</TD>
                    <TD className="text-xs tabular-nums">
                      {pctCell(r.actualPotentialSold, r.targetPotentialSold)}
                    </TD>
                    <TD className="text-xs tabular-nums">
                      {pctCell(r.actualExistingSold, r.targetExistingSold)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </Card>

      {planTiers.length > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold text-brand">Plan tiers by salesperson</p>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Salesperson</TH>
                  {planTiers.map((tier) => (
                    <TH key={tier}>{tierLabel(tier)}</TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {members.map((r) => (
                  <TR key={r.userId}>
                    <TD className="font-medium">{r.salesperson}</TD>
                    {planTiers.map((tier) => {
                      const target = Number(r.planTargets?.[tier] ?? 0);
                      const actual = Number(r.planSold?.[tier] ?? 0);
                      return (
                        <TD key={tier} className="text-xs tabular-nums">
                          {target > 0 || actual > 0 ? pctCell(actual, target) : "—"}
                        </TD>
                      );
                    })}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      ) : null}

      <Card>
        <p className="mb-2 text-sm font-semibold text-brand">
          Closed deals this month ({closedDeals.length})
        </p>
        {closedDeals.length === 0 ? (
          <p className="text-sm text-slate-muted">No closed deals in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>MUA</TH>
                  <TH>Salesperson</TH>
                  <TH>Plan</TH>
                  <TH>Amount</TH>
                  <TH>Closed</TH>
                </TR>
              </THead>
              <TBody>
                {closedDeals.map((d, i) => (
                  <TR key={`${d.muaName}-${i}`}>
                    <TD>{d.muaName}</TD>
                    <TD>{d.salesperson}</TD>
                    <TD>{d.planLabel}</TD>
                    <TD>₹{Number(d.amount).toLocaleString("en-IN")}</TD>
                    <TD>{new Date(d.closedAt).toLocaleDateString("en-IN")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {closedDeals.length > 0 ? (
          <p className="mt-2 text-xs text-slate-muted">
            Total from list: ₹
            {closedDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0).toLocaleString("en-IN")}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
