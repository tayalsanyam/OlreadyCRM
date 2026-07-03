"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminMuasNav } from "@/components/admin/AdminMuasNav";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { Button } from "@/components/ui/Button";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { junkCustomerSegmentLabel, salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { cn } from "@/lib/utils";

type JunkRow = {
  id: string;
  pipelineId: string;
  muaId: string;
  muaName: string;
  muaCity: string | null;
  muaSource: string | null;
  muaType: string;
  customerSegment: string | null;
  assignedToName: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  junkReason: string | null;
  junkedByName: string | null;
  junkedAt: string;
  junkedFrom: string | null;
};

type SegmentFilter = "all" | "prospect" | "ex_customer";

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function junkedFromLabel(value: string | null): string {
  if (value === "rejected_queue") return "Rejected queue";
  return value ?? "—";
}

export default function AdminMuasJunkPage() {
  const [rows, setRows] = useState<JunkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<SegmentFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = segment === "all" ? "" : `?segment=${segment}`;
    const res = await fetch(`/api/admin/sales/junk${qs}`);
    const j = (await res.json()) as { data?: JunkRow[] };
    setRows(j.data ?? []);
    setLoading(false);
  }, [segment]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportQuery = segment === "all" ? "" : `segment=${segment}`;

  return (
    <div className="space-y-4">
      <AdminMuasNav />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Junk reference</h1>
          <p className="text-sm text-slate-muted">
            Archived sales pipeline records from rejection. Second reject auto-archives here — prospects vs former
            customers are split. Nothing is deleted. To work a junked MUA again, create a new sales pipeline from{" "}
            <strong>Manage MUAs</strong> (the MUA roster record is kept). Before junk, use{" "}
            <strong>Rejected queue</strong> to re-assign once.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/sales/rejected">
            <Button variant="secondary">Rejected queue</Button>
          </Link>
          <AdminExportCsvButton apiPath="/api/admin/sales/junk" query={exportQuery} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["prospect", "Prospect (never customer)"],
            ["ex_customer", "Former customer"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSegment(value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              segment === value ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>Pipeline</TH>
              <TH>Segment</TH>
              <TH>Type</TH>
              <TH>Sales RM</TH>
              <TH>Rejection</TH>
              <TH>Junk reason</TH>
              <TH>Junked</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={8} className="text-slate-muted">
                  No junked records in this view.
                </TD>
              </TR>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`/admin/muas/${r.muaId}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {r.muaName}
                    </Link>
                    <p className="text-xs text-slate-muted">
                      {r.muaCity ?? "—"}
                      {r.muaSource ? ` · ${r.muaSource}` : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-muted" title={r.muaId}>
                      MUA {shortId(r.muaId)}
                    </p>
                  </TD>
                  <TD>
                    <p className="font-mono text-xs text-slate-700" title={r.pipelineId}>
                      {shortId(r.pipelineId)}
                    </p>
                    <p className="text-[10px] text-slate-muted">Archived pipeline</p>
                  </TD>
                  <TD>{junkCustomerSegmentLabel(r.customerSegment)}</TD>
                  <TD>{salesPipelineMuaTypeLabel(r.muaType)}</TD>
                  <TD>{r.assignedToName ?? "—"}</TD>
                  <TD>
                    <p>{r.rejectionReason ?? "—"}</p>
                    {r.rejectionNote ? (
                      <p className="text-xs text-slate-muted line-clamp-2">{r.rejectionNote}</p>
                    ) : null}
                  </TD>
                  <TD>
                    <p>{r.junkReason ?? "—"}</p>
                    <p className="text-[10px] text-slate-muted">{junkedFromLabel(r.junkedFrom)}</p>
                  </TD>
                  <TD className="text-xs text-slate-muted">
                    {new Date(r.junkedAt).toLocaleString("en-IN")}
                    {r.junkedByName ? ` · ${r.junkedByName}` : ""}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}
    </div>
  );
}
