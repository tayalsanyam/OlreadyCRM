"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import type { MuaPlanPeriodDetail } from "@/lib/mua-plan-period-detail-shared";
import { formatSocialMediaDealLabel, formatYesNo } from "@/lib/sales-plan-details";
import { PLAN_TIER_LABELS } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function MuaPlanPeriodDetailView({
  detail,
  heading,
  nested = false,
}: {
  detail: MuaPlanPeriodDetail;
  heading?: string;
  nested?: boolean;
}) {
  const { plan, commercial, dealTerms, contactEmail, partialNote } = detail;
  const planLabel = plan.tier ? PLAN_TIER_LABELS[plan.tier] : plan.tierName ?? "Non-plan";
  const soldBy = commercial.salesClosedByName?.trim() || null;
  const hasDealTerms = Boolean(commercial.pipelineId && dealTerms);

  return (
    <div className={cn("space-y-3", nested && "border-t border-slate-100 pt-3")}>
      {heading ? <h3 className="text-sm font-semibold text-brand">{heading}</h3> : null}
      {partialNote ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {partialNote}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={plan.tier ? "default" : "muted"}>{planLabel}</Badge>
        {plan.expiry ? (
          <span className="text-xs text-slate-muted">Expires {formatDate(plan.expiry)}</span>
        ) : null}
      </div>
      {soldBy ? (
        <p className="text-sm text-slate-600">
          Plan sold by <span className="font-medium text-brand">{soldBy}</span>
        </p>
      ) : null}
      {contactEmail ? (
        <p className="text-sm text-slate-600">
          Email{" "}
          <a href={`mailto:${contactEmail}`} className="font-medium text-accent hover:underline">
            {contactEmail}
          </a>
        </p>
      ) : null}
      {plan.planSummary ? <p className="text-sm text-slate-600">{plan.planSummary}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "List price", value: plan.listPriceInr != null ? fmt.format(plan.listPriceInr) : "—" },
          { label: "Weekly cap", value: plan.weeklyCap },
          { label: "Monthly push target", value: plan.monthlyPushTarget ?? "—" },
          { label: "Assured bookings", value: plan.assuredBookings ?? "—" },
          { label: "Lead cap", value: plan.leadCap ?? "—" },
          { label: "Lead budget tiers", value: plan.leadBudget?.trim() || "—" },
          {
            label: "Plan period",
            value:
              plan.durationStart && plan.durationEnd
                ? `${formatDate(plan.durationStart)} – ${formatDate(plan.durationEnd)}`
                : "—",
          },
        ].map((row) => (
          <div key={row.label} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-muted">
              {row.label}
            </p>
            <p className="text-sm font-medium text-brand">{row.value}</p>
          </div>
        ))}
      </div>
      {(plan.planStates.length > 0 || plan.planCities.length > 0) && (
        <p className="text-xs text-slate-muted">
          Coverage:{" "}
          {plan.planStates.length ? `States — ${plan.planStates.join(", ")}` : ""}
          {plan.planStates.length && plan.planCities.length ? " · " : ""}
          {plan.planCities.length ? `Cities — ${plan.planCities.join(", ")}` : ""}
        </p>
      )}

      {hasDealTerms ? (
        <Card className="space-y-3 p-3">
          <h4 className="text-sm font-semibold text-brand">Deal confirmation (at sale)</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "RM Support", value: formatYesNo(dealTerms?.rmSupport) },
              { label: "Lead Reversal", value: formatYesNo(dealTerms?.leadReversal) },
              {
                label: "Social Media",
                value: formatSocialMediaDealLabel({
                  socialMedia: dealTerms?.socialMedia,
                  hasSocialMedia: dealTerms?.hasSocialMedia,
                }),
              },
              {
                label: "Assured bookings",
                value:
                  dealTerms?.assuredBookings != null && dealTerms.assuredBookings > 0
                    ? String(dealTerms.assuredBookings)
                    : "—",
              },
              {
                label: "Avg revenue target",
                value:
                  dealTerms?.avgRevenueTarget != null && dealTerms.avgRevenueTarget > 0
                    ? fmt.format(dealTerms.avgRevenueTarget)
                    : "—",
              },
            ].map((row) => (
              <div key={row.label} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-muted">
                  {row.label}
                </p>
                <p className="text-sm font-medium text-brand">{row.value}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {commercial.pipelineId ? (
        <Card className="space-y-3 p-3">
          <h4 className="text-sm font-semibold text-brand">Invoice & contract</h4>
          <p className="text-xs text-slate-muted">
            Sales pipeline: {commercial.pipelineStage ?? "—"}
            {commercial.planName ? ` · Plan sold: ${commercial.planName}` : ""}
            {commercial.salesClosedByName ? ` · Sold by ${commercial.salesClosedByName}` : ""}
            {commercial.activatedAt ? ` · Activated ${formatDate(commercial.activatedAt)}` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-muted">Invoice</p>
              <p className="mt-1 text-sm font-medium text-brand">
                {commercial.invoiceNumber?.trim() || "—"}
              </p>
              <Badge variant={commercial.invoiceGenerated ? "success" : "muted"} className="mt-2">
                {commercial.invoiceGenerated ? "Generated" : "Pending"}
              </Badge>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-muted">Contract</p>
              {commercial.contractUrl ? (
                <Link
                  href={commercial.contractUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm font-medium text-accent hover:underline"
                >
                  View signed contract ↗
                </Link>
              ) : (
                <p className="mt-1 text-sm text-slate-muted">Not uploaded</p>
              )}
              <Badge variant={commercial.contractGenerated ? "success" : "muted"} className="mt-2">
                {commercial.contractGenerated ? "Generated" : "Pending"}
              </Badge>
            </div>
          </div>
          {(commercial.quotedAmount != null || commercial.plansShared.length > 0) && (
            <div>
              <p className="mb-2 text-sm font-medium text-brand">Deal pricing</p>
              {commercial.quotedAmount != null ? (
                <p className="text-sm">
                  Quoted / closed amount: <strong>{fmt.format(commercial.quotedAmount)}</strong>
                </p>
              ) : null}
              {commercial.plansShared.length > 0 ? (
                <Table className="mt-2">
                  <THead>
                    <TR>
                      <TH>Plan option shared</TH>
                      <TH>Amount</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {commercial.plansShared.map((row) => (
                      <TR key={`${row.plan}-${row.amount}`}>
                        <TD>{row.plan}</TD>
                        <TD>{fmt.format(row.amount)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : null}
            </div>
          )}
          {commercial.payments.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-brand">Payments recorded</p>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Amount</TH>
                    <TH>Mode</TH>
                  </TR>
                </THead>
                <TBody>
                  {commercial.payments.map((p, i) => (
                    <TR key={`${p.paymentDate}-${i}`}>
                      <TD>{formatDate(p.paymentDate)}</TD>
                      <TD>{fmt.format(p.amount)}</TD>
                      <TD className="capitalize">{p.paymentMode}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
