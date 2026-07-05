"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  formatDiscountTaskDisplayTitle,
  formatInr,
  formatStaffRoleLabel,
  type AdminDiscountTaskDetails,
} from "@/lib/sales-deal-discount-shared";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-1 text-sm">
      <span className="text-slate-muted">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

export function DealDiscountDetailsCard({
  details,
  title,
}: {
  details: AdminDiscountTaskDetails;
  title?: string;
}) {
  const heading = title ?? formatDiscountTaskDisplayTitle(`Approve deal discount — ${details.muaName}`);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div>
        <p className="text-sm font-semibold text-brand">{heading}</p>
        {details.pipelineStage ? (
          <p className="text-xs text-slate-muted">Pipeline stage: {details.pipelineStage}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <DetailRow label="MUA" value={details.muaName} />
        <DetailRow label="List price" value={formatInr(details.listPrice)} />
        <DetailRow label="Discount" value={formatInr(details.discountAmount)} />
        <DetailRow label="Net deal price" value={formatInr(details.netQuoted)} />
        {details.priorPaid > 0 ? (
          <DetailRow label="Already received" value={formatInr(details.priorPaid)} />
        ) : null}
        {details.paymentAmount != null && details.paymentAmount > 0 ? (
          <DetailRow
            label="Payment on close"
            value={
              <>
                {formatInr(details.paymentAmount)}
                {details.paymentMode ? ` · ${details.paymentMode}` : ""}
                {details.paymentDate
                  ? ` · ${new Date(details.paymentDate).toLocaleDateString("en-IN")}`
                  : ""}
              </>
            }
          />
        ) : null}
        <DetailRow label="Reason" value={details.reason || "—"} />
        {details.requestedByName ? (
          <DetailRow
            label="Requested by"
            value={
              <>
                {details.requestedByName}
                {formatStaffRoleLabel(details.requestedRole)
                  ? ` (${formatStaffRoleLabel(details.requestedRole)})`
                  : ""}
              </>
            }
          />
        ) : null}
        {details.requestedAt ? (
          <DetailRow
            label="Requested"
            value={new Date(details.requestedAt).toLocaleString("en-IN")}
          />
        ) : null}
        {details.salesNote ? (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            <p className="text-xs font-medium uppercase text-slate-muted">Sales note</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{details.salesNote}</p>
          </div>
        ) : null}
      </div>

      <Link href="/sales/pipeline" className="text-xs text-accent hover:underline">
        Open sales pipeline →
      </Link>
    </div>
  );
}
