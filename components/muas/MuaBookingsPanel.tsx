"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import type { MuaBookingLedgerRow, MuaBookingsSummary } from "@/lib/mua-bookings";
import { formatDate } from "@/lib/utils";

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const SOURCE_LABEL: Record<MuaBookingLedgerRow["source"], string> = {
  rm: "RM",
  commission: "Commission",
  feedback: "Feedback",
};

const SOURCE_VARIANT: Record<
  MuaBookingLedgerRow["source"],
  "default" | "tier2" | "active"
> = {
  rm: "default",
  commission: "tier2",
  feedback: "active",
};

export function MuaBookingsPanel({
  muaId,
  leadHrefPrefix = "/rm/leads",
}: {
  muaId: string;
  leadHrefPrefix?: string;
}) {
  const [summary, setSummary] = useState<MuaBookingsSummary | null>(null);
  const [rows, setRows] = useState<MuaBookingLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/muas/${muaId}/bookings`)
      .then((r) => r.json())
      .then((json) => {
        setSummary(json.data?.summary ?? null);
        setRows(json.data?.rows ?? []);
        setLoading(false);
      });
  }, [muaId]);

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-sm text-slate-muted">Loading bookings…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-muted">
          RM and Commission confirmations plus feedback-verified bookings (portal
          push, no duplicate if already booked on profile).
        </p>
        <a
          href={`/api/muas/${muaId}/bookings?format=csv`}
          className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand hover:bg-slate-50"
        >
          Export CSV ↓
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total bookings", value: summary?.totalCount ?? 0 },
          { label: "RM / Commission", value: summary?.formalCount ?? 0 },
          { label: "Feedback verified", value: summary?.feedbackCount ?? 0 },
          {
            label: "Formal revenue",
            value: fmt.format(summary?.formalRevenue ?? 0),
          },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-3 text-center">
            <p className="text-2xl font-bold text-brand">{kpi.value}</p>
            <p className="text-xs text-slate-muted">{kpi.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-muted">No bookings recorded for this MUA yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Source</TH>
                <TH>Bride</TH>
                <TH>Ceremony</TH>
                <TH>Price</TH>
                <TH>Plan tag</TH>
                <TH>Recorded by</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={`${r.source}-${r.id}`} className={r.cancelled ? "opacity-60" : ""}>
                  <TD className="whitespace-nowrap text-xs text-slate-muted">
                    {formatDate(r.bookingDate)}
                  </TD>
                  <TD>
                    <Badge variant={SOURCE_VARIANT[r.source]}>{SOURCE_LABEL[r.source]}</Badge>
                    {r.cancelled && (
                      <span className="ml-1 text-[10px] text-red-600">cancelled</span>
                    )}
                  </TD>
                  <TD>
                    <Link
                      href={`${leadHrefPrefix}/${r.leadId}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {r.brideName}
                    </Link>
                    <p className="font-mono text-[10px] text-slate-muted">{r.displayId}</p>
                  </TD>
                  <TD className="text-xs">
                    {r.ceremonyType ?? "—"}
                    {r.eventDate ? (
                      <span className="block text-slate-muted">{formatDate(r.eventDate)}</span>
                    ) : null}
                  </TD>
                  <TD className="text-sm">
                    {r.bookedPrice != null
                      ? fmt.format(r.bookedPrice)
                      : r.source === "feedback"
                        ? "—"
                        : "—"}
                  </TD>
                  <TD>
                    {r.source === "feedback" ? (
                      <Badge variant={r.onPlan ? "success" : "muted"}>
                        {r.onPlan ? "On plan" : "Not on plan"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-muted">—</span>
                    )}
                  </TD>
                  <TD className="text-xs text-slate-muted">{r.recordedBy ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
