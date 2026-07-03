"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import type { MuaFeedbackRow, MuaFeedbackSummary } from "@/lib/mua-feedback";
import { formatDate } from "@/lib/utils";

const SENTIMENT_VARIANT: Record<string, "success" | "critical" | "active" | "muted"> = {
  positive: "success",
  negative: "critical",
  mixed: "active",
};

function formatRating(value: number | null): string {
  if (value == null) return "—";
  return `${value}/5`;
}

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-muted">—</span>;
  return (
    <span className="font-medium text-brand" title={`${value} out of 5`}>
      {value.toFixed(1)}
      <span className="ml-0.5 text-amber-500">★</span>
    </span>
  );
}

export function MuaFeedbackPanel({
  muaId,
  leadHrefPrefix = "/rm/leads",
}: {
  muaId: string;
  leadHrefPrefix?: string;
}) {
  const [summary, setSummary] = useState<MuaFeedbackSummary | null>(null);
  const [rows, setRows] = useState<MuaFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/muas/${muaId}/feedback`)
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
        <p className="text-sm text-slate-muted">Loading feedback…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Avg MUA rating",
            value:
              summary?.avgMuaRating != null
                ? `${summary.avgMuaRating.toFixed(1)} / 5`
                : "—",
          },
          {
            label: "Avg Olready rating",
            value:
              summary?.avgOlreadyRating != null
                ? `${summary.avgOlreadyRating.toFixed(1)} / 5`
                : "—",
          },
          {
            label: "Connected feedbacks",
            value: summary?.feedbackCount ?? 0,
          },
          {
            label: "With MUA rating",
            value: summary?.ratedCount ?? 0,
          },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-3 text-center">
            <p className="text-2xl font-bold text-brand">{kpi.value}</p>
            <p className="text-xs text-slate-muted">{kpi.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-brand">Post-event bride feedback</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-muted">
            No connected feedback yet where brides named this MUA as their artist.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Bride</TH>
                <TH>MUA rating</TH>
                <TH>Olready</TH>
                <TH>Sentiment</TH>
                <TH>MUA note</TH>
                <TH>Captured by</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-xs text-slate-muted">
                    {formatDate(r.createdAt)}
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
                  <TD>
                    <Stars value={r.muaRating} />
                  </TD>
                  <TD className="text-sm">{formatRating(r.olreadyRating)}</TD>
                  <TD>
                    {r.serviceSentiment ? (
                      <Badge
                        variant={SENTIMENT_VARIANT[r.serviceSentiment] ?? "muted"}
                        className="capitalize"
                      >
                        {r.serviceSentiment}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="max-w-[200px] text-xs text-slate-600">
                    {r.muaServiceNote?.trim() || "—"}
                  </TD>
                  <TD className="text-xs text-slate-muted">{r.submittedByName ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
