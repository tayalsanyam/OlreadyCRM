"use client";

import { useCallback, useEffect, useState } from "react";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ActivationWizard } from "@/components/activation/ActivationWizard";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";

type Row = {
  id: string;
  muaName: string;
  muaCity: string;
  muaType: string;
  assignedSalesName: string | null;
  salesClosedByName: string | null;
  sentBackAt: string;
  sentBackNote: string | null;
  daysSinceSendBack: number;
  salesTaskPending: boolean;
  activationFollowUpPending: boolean;
};

export default function ActivationSentBackPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/activation/sent-back");
    const json = (await res.json()) as { data?: Row[] };
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Sent back to sales</h1>
          <p className="text-sm text-slate-muted">
            MUAs waiting for the salesperson to fix training. If sales has not acted by the next day, a follow-up
            task is created for you to chase them.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-muted">
          No activations are currently sent back to sales.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>Salesperson</TH>
              <TH>Sent back</TH>
              <TH>Days waiting</TH>
              <TH>Reason</TH>
              <TH>Tasks</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const salesperson = r.assignedSalesName ?? r.salesClosedByName ?? "—";
              const overdue = r.daysSinceSendBack >= 1;
              return (
                <TR key={r.id}>
                  <TD>
                    <p className="font-medium text-text">{r.muaName}</p>
                    <p className="text-xs text-slate-muted">
                      {[r.muaCity, salesPipelineMuaTypeLabel(r.muaType)].filter(Boolean).join(" · ")}
                    </p>
                  </TD>
                  <TD>{salesperson}</TD>
                  <TD>{new Date(r.sentBackAt).toLocaleString("en-IN")}</TD>
                  <TD className={overdue ? "font-semibold text-amber-700" : ""}>{r.daysSinceSendBack}</TD>
                  <TD className="max-w-xs">
                    <p className="line-clamp-3 text-xs text-slate-700">{r.sentBackNote ?? "—"}</p>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {r.salesTaskPending ? (
                        <Badge variant="muted">Sales task open</Badge>
                      ) : (
                        <Badge variant="muted">No sales task</Badge>
                      )}
                      {r.activationFollowUpPending ? (
                        <Badge>Your follow-up</Badge>
                      ) : overdue ? (
                        <Badge variant="muted">Follow-up due</Badge>
                      ) : null}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => setActivePipelineId(r.id)}>
                      View
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <ActivationWizard
        open={Boolean(activePipelineId)}
        onClose={() => setActivePipelineId(null)}
        pipelineId={activePipelineId ?? ""}
        onDone={() => {
          setActivePipelineId(null);
          void load();
        }}
      />
    </div>
  );
}
