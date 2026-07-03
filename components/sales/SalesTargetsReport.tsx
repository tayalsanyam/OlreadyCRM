"use client";

import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { SALES_PLAN_TIERS } from "@/lib/sales-targets";
import { PLAN_TIER_LABELS, type PlanTier } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";

type ClosedDealRow = {
  id: string;
  muaName: string;
  muaCity?: string | null;
  muaType: string;
  revenue: number;
  closedAt: string;
  closedByName?: string | null;
};

export type SalesTargetMemberRow = {
  userId: string;
  name: string;
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
  actualSold: number;
};

export type SalesTargetsPayload = {
  month: string;
  hasTarget?: boolean;
  target: {
    targetRevenue?: number;
    targetPotentialCalls?: number;
    targetPotentialSold?: number;
    targetExistingCalls?: number;
    targetExistingSold?: number;
    targetSoldTotal?: number;
    minCallsPerDay?: number;
    minTalkTimeMinPerDay?: number;
    planTargets?: Record<string, number | null> | null;
  } | null;
  actuals: {
    revenue: number;
    sold: number;
    potentialCalls?: number;
    potentialSold?: number;
    existingCalls?: number;
    existingSold?: number;
    avgCallsPerDay?: number;
    avgTalkTimePerDay?: number;
    planSold?: Record<string, number>;
  };
  pace?: {
    daysElapsed: number;
    daysInMonth: number;
    daysRemaining: number;
    timePct: number;
    revenuePct: number;
    soldPct: number;
    potentialSoldPct?: number;
    existingSoldPct?: number;
    potentialCallsPct?: number;
    existingCallsPct?: number;
    revenueGap: number;
    soldGap: number;
    potentialSoldGap?: number;
    existingSoldGap?: number;
    potentialCallsGap?: number;
    existingCallsGap?: number;
    projectedRevenue: number;
    projectedSold: number;
    revenueOnPace: boolean;
    soldOnPace: boolean;
    callsPct: number;
    talkPct: number;
  };
  byMember?: SalesTargetMemberRow[];
  closedDeals?: ClosedDealRow[];
};

function pct(actual: number, target?: number | null): number {
  const t = Number(target ?? 0);
  if (t <= 0) return 0;
  return Math.max(0, Math.round((actual / t) * 100));
}

function progressClass(v: number): string {
  if (v >= 80) return "bg-emerald-600";
  if (v >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function paceLabel(onPace: boolean, pctVal: number, timePct: number): string {
  if (pctVal >= 100) return "Target hit";
  if (onPace) return "On pace";
  if (pctVal >= timePct - 15) return "Slightly behind";
  return "Behind pace";
}

function paceClass(onPace: boolean, pctVal: number, timePct: number): string {
  if (pctVal >= 100) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (onPace) return "border-teal-200 bg-teal-50 text-teal-900";
  if (pctVal >= timePct - 15) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function tierLabel(tier: string): string {
  return PLAN_TIER_LABELS[tier as PlanTier] ?? tier;
}

function MetricBlock({
  label,
  actual,
  target,
  format = "number",
  sublabel,
}: {
  label: string;
  actual: number;
  target?: number | null;
  format?: "number" | "currency";
  sublabel?: string;
}) {
  const p = pct(actual, target);
  const hasTarget = target != null && target > 0;
  const display =
    format === "currency" ? `₹${actual.toLocaleString("en-IN")}` : String(actual);
  const targetDisplay =
    format === "currency"
      ? hasTarget
        ? `₹${Number(target).toLocaleString("en-IN")}`
        : "—"
      : hasTarget
        ? String(target)
        : "—";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand">{display}</p>
      <p className="text-xs text-slate-muted">
        Target: {targetDisplay}
        {hasTarget ? ` · ${p}%` : ""}
      </p>
      {sublabel ? <p className="mt-1 text-[11px] text-slate-muted">{sublabel}</p> : null}
      {hasTarget ? (
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div
            className={`h-2 rounded-full ${progressClass(p)}`}
            style={{ width: `${Math.min(p, 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SegmentMetric({
  label,
  actual,
  target,
  hint,
}: {
  label: string;
  actual: number;
  target?: number;
  hint?: string;
}) {
  const hasTarget = (target ?? 0) > 0;
  const p = pct(actual, target);
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-brand">
        {actual}
        {hasTarget ? (
          <span className="text-sm font-normal text-slate-muted"> / {target}</span>
        ) : null}
      </p>
      {hasTarget ? (
        <>
          <p className="text-[11px] font-medium text-slate-600">{p}% of target</p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100">
            <div
              className={`h-1.5 rounded-full ${progressClass(p)}`}
              style={{ width: `${Math.min(p, 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-[11px] text-slate-muted">{hint ?? "No target set"}</p>
      )}
    </div>
  );
}

export function SalesTargetsReport({
  data,
  month,
  showTeam,
  showAssignee,
  onOpenPipeline,
  onJumpToClosing,
}: {
  data: SalesTargetsPayload;
  month: string;
  showTeam?: boolean;
  showAssignee?: boolean;
  onOpenPipeline: (id: string) => void;
  onJumpToClosing?: () => void;
}) {
  const pace = data.pace;
  const target = data.target;
  const revenueTarget = Number(target?.targetRevenue ?? 0);
  const soldTarget = Number(target?.targetSoldTotal ?? 0);
  const potentialSoldTarget = Number(target?.targetPotentialSold ?? 0);
  const existingSoldTarget = Number(target?.targetExistingSold ?? 0);
  const potentialCallsTarget = Number(target?.targetPotentialCalls ?? 0);
  const existingCallsTarget = Number(target?.targetExistingCalls ?? 0);

  const planTargets = (() => {
    const raw = target?.planTargets ?? null;
    if (!raw || typeof raw !== "object") return {} as Record<string, number>;
    const merged: Record<string, number> = {};
    for (const [tier, value] of Object.entries(raw)) {
      const n = Number(value ?? 0);
      if (Number.isFinite(n) && n > 0) merged[tier] = n;
    }
    return merged;
  })();

  const planSold = data.actuals.planSold ?? {};
  const planTiers = SALES_PLAN_TIERS.filter(
    (tier) => (planTargets[tier] ?? 0) > 0 || (planSold[tier] ?? 0) > 0,
  );

  const closedDeals = data.closedDeals ?? [];
  const closedRevenue = closedDeals.reduce((s, d) => s + Number(d.revenue ?? 0), 0);
  const byMember = data.byMember ?? [];

  const segmentSoldActual =
    Number(data.actuals.potentialSold ?? 0) + Number(data.actuals.existingSold ?? 0);

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  })();

  return (
    <div className="space-y-4">
      {!data.hasTarget ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No target set for {monthLabel}. Progress below is from actuals only.
        </div>
      ) : null}

      {pace ? (
        <div className={`rounded-xl border p-4 ${paceClass(pace.soldOnPace, pace.soldPct, pace.timePct)}`}>
          <p className="text-sm font-semibold">
            {monthLabel} · Day {pace.daysElapsed} of {pace.daysInMonth}
            {pace.daysRemaining > 0 ? ` · ${pace.daysRemaining} days left` : ""}
          </p>
          <p className="mt-1 text-sm">
            {pace.soldGap > 0 ? (
              <>
                Need <strong>{pace.soldGap}</strong> more deal{pace.soldGap === 1 ? "" : "s"} total
              </>
            ) : (
              <>Deal target met</>
            )}
            {pace.potentialSoldGap != null && pace.potentialSoldGap > 0 ? (
              <>
                {" "}
                (<strong>{pace.potentialSoldGap}</strong> potential,{" "}
                <strong>{pace.existingSoldGap ?? 0}</strong> existing)
              </>
            ) : null}
            {pace.revenueGap > 0 ? (
              <>
                {" "}
                and <strong>₹{pace.revenueGap.toLocaleString("en-IN")}</strong> revenue
              </>
            ) : pace.soldGap > 0 ? null : (
              <> · Revenue target met</>
            )}
            {pace.soldGap > 0 || pace.revenueGap > 0 ? "." : ""}
          </p>
          <p className="mt-1 text-xs opacity-90">
            At current rate: projecting ~{Math.round(pace.projectedSold)} deals and ₹
            {pace.projectedRevenue.toLocaleString("en-IN")} revenue this month ·{" "}
            {paceLabel(pace.soldOnPace, pace.soldPct, pace.timePct)}
          </p>
          {segmentSoldActual !== data.actuals.sold ? (
            <p className="mt-1 text-xs text-amber-800">
              Segment closes ({segmentSoldActual}) differ from total ({data.actuals.sold}) — review data.
            </p>
          ) : soldTarget > 0 ? (
            <p className="mt-1 text-xs opacity-80">
              Target breakdown: {potentialSoldTarget} potential + {existingSoldTarget} existing ={" "}
              {soldTarget} total
            </p>
          ) : null}
          {onJumpToClosing && (pace.soldGap > 0 || pace.revenueGap > 0) ? (
            <button
              type="button"
              onClick={onJumpToClosing}
              className="mt-2 text-xs font-semibold underline underline-offset-2"
            >
              View deals closing next →
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricBlock
          label="Revenue"
          actual={data.actuals.revenue}
          target={revenueTarget}
          format="currency"
          sublabel={pace ? `${pace.revenuePct}% of target · ${pace.timePct}% of month elapsed` : undefined}
        />
        <MetricBlock
          label="Deals closed (total)"
          actual={data.actuals.sold}
          target={soldTarget}
          sublabel={
            soldTarget > 0
              ? `${potentialSoldTarget} potential + ${existingSoldTarget} existing target`
              : pace
                ? paceLabel(pace.soldOnPace, pace.soldPct, pace.timePct)
                : undefined
          }
        />
        <MetricBlock
          label="Avg calls / day (7d)"
          actual={Number(data.actuals.avgCallsPerDay ?? 0)}
          target={target?.minCallsPerDay}
          sublabel={
            target?.minCallsPerDay
              ? `${pace?.callsPct ?? pct(Number(data.actuals.avgCallsPerDay ?? 0), target.minCallsPerDay)}% of daily target`
              : "No daily call target set"
          }
        />
        <MetricBlock
          label="Avg talk time / day (7d)"
          actual={Number(data.actuals.avgTalkTimePerDay ?? 0)}
          target={target?.minTalkTimeMinPerDay}
          sublabel={
            target?.minTalkTimeMinPerDay
              ? `${pace?.talkPct ?? pct(Number(data.actuals.avgTalkTimePerDay ?? 0), target.minTalkTimeMinPerDay)}% of daily target · min`
              : "No talk-time target set"
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="space-y-3">
          <p className="text-sm font-semibold text-brand">Potential (new MUAs)</p>
          <div className="grid grid-cols-2 gap-3">
            <SegmentMetric
              label="MUAs contacted"
              actual={data.actuals.potentialCalls ?? 0}
              target={potentialCallsTarget}
              hint="Unique pipeline touchpoints this month"
            />
            <SegmentMetric
              label="Deals closed"
              actual={data.actuals.potentialSold ?? 0}
              target={potentialSoldTarget}
              hint="Candidate segment"
            />
          </div>
        </Card>
        <Card className="space-y-3">
          <p className="text-sm font-semibold text-brand">Existing (renewal & re-engage)</p>
          <div className="grid grid-cols-2 gap-3">
            <SegmentMetric
              label="MUAs contacted"
              actual={data.actuals.existingCalls ?? 0}
              target={existingCallsTarget}
              hint="Renewal + re-engage touchpoints"
            />
            <SegmentMetric
              label="Deals closed"
              actual={data.actuals.existingSold ?? 0}
              target={existingSoldTarget}
              hint="Renewal + re-engage segment"
            />
          </div>
        </Card>
      </div>

      {planTiers.length > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold text-brand">Plan-tier targets</p>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Plan</TH>
                  <TH>Target</TH>
                  <TH>Closed</TH>
                  <TH>Progress</TH>
                </TR>
              </THead>
              <TBody>
                {planTiers.map((tier) => {
                  const targetCount = planTargets[tier] ?? 0;
                  const actual = planSold[tier] ?? 0;
                  const p = targetCount > 0 ? pct(actual, targetCount) : null;
                  return (
                    <TR key={tier}>
                      <TD className="font-medium">{tierLabel(tier)}</TD>
                      <TD className="tabular-nums">{targetCount > 0 ? targetCount : "—"}</TD>
                      <TD className="tabular-nums">{actual}</TD>
                      <TD>
                        {p != null ? (
                          <div className="flex min-w-[100px] items-center gap-2">
                            <div className="h-1.5 flex-1 rounded bg-slate-100">
                              <div
                                className={`h-1.5 rounded ${progressClass(p)}`}
                                style={{ width: `${Math.min(p, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums">{p}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-muted">No target set</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </Card>
      ) : (
        <Card className="border-dashed">
          <p className="text-sm text-slate-muted">
            No plan-tier targets or closes this month. Privy / Phoenix / etc. targets are set by admin under
            Sales targets.
          </p>
        </Card>
      )}

      {showTeam && byMember.length > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold text-brand">Team target progress</p>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Member</TH>
                  <TH>Revenue</TH>
                  <TH>Potential contacted</TH>
                  <TH>Potential closed</TH>
                  <TH>Existing contacted</TH>
                  <TH>Existing closed</TH>
                  <TH>Total deals</TH>
                </TR>
              </THead>
              <TBody>
                {byMember.map((r) => {
                  const rp = pct(Number(r.actualRevenue), Number(r.targetRevenue));
                  return (
                    <TR key={r.userId}>
                      <TD className="font-medium">{r.name}</TD>
                      <TD>
                        <div className="min-w-[120px]">
                          <span className="text-xs">
                            ₹{Number(r.actualRevenue).toLocaleString("en-IN")} / ₹
                            {Number(r.targetRevenue).toLocaleString("en-IN")}
                          </span>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded bg-slate-100">
                              <div
                                className={`h-1.5 rounded ${progressClass(rp)}`}
                                style={{ width: `${Math.min(rp, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px]">{rp}%</span>
                          </div>
                        </div>
                      </TD>
                      <TD className="text-xs tabular-nums">
                        {r.actualPotentialCalls} / {r.targetPotentialCalls || "—"}
                      </TD>
                      <TD className="text-xs tabular-nums">
                        {r.actualPotentialSold} / {r.targetPotentialSold || "—"}
                      </TD>
                      <TD className="text-xs tabular-nums">
                        {r.actualExistingCalls} / {r.targetExistingCalls || "—"}
                      </TD>
                      <TD className="text-xs tabular-nums">
                        {r.actualExistingSold} / {r.targetExistingSold || "—"}
                      </TD>
                      <TD className="text-xs tabular-nums font-medium">
                        {r.actualSold} / {r.targetSoldTotal || "—"}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-brand">
              Closed this month ({closedDeals.length})
            </p>
            <p className="text-xs text-slate-muted">
              Total revenue from closed deals: ₹{closedRevenue.toLocaleString("en-IN")}
              {closedRevenue !== Number(data.actuals.revenue ?? 0) ? (
                <>
                  {" "}
                  · Payments this month (all deals): ₹
                  {Number(data.actuals.revenue ?? 0).toLocaleString("en-IN")}
                </>
              ) : null}
              {" "}
              · Revenue is the sum of payments recorded this month per deal
            </p>
          </div>
        </div>
        {closedDeals.length ? (
          <Table>
            <THead>
              <TR>
                <TH>MUA</TH>
                <TH>Segment</TH>
                <TH>Revenue</TH>
                <TH>Closed on</TH>
                {showAssignee ? <TH>Closed by</TH> : null}
              </TR>
            </THead>
            <TBody>
              {closedDeals.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <button
                      type="button"
                      className="text-left font-medium text-accent hover:underline"
                      onClick={() => onOpenPipeline(r.id)}
                    >
                      {r.muaName}
                    </button>
                    {r.muaCity ? <p className="text-xs text-slate-muted">{r.muaCity}</p> : null}
                  </TD>
                  <TD>{salesPipelineMuaTypeLabel(r.muaType)}</TD>
                  <TD>₹{Number(r.revenue ?? 0).toLocaleString("en-IN")}</TD>
                  <TD>{new Date(r.closedAt).toLocaleDateString("en-IN")}</TD>
                  {showAssignee ? <TD>{r.closedByName ?? "—"}</TD> : null}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="text-sm text-slate-muted">
            No deals closed in {monthLabel} yet. Check the Work queue for MUAs near close.
          </p>
        )}
      </Card>
    </div>
  );
}
