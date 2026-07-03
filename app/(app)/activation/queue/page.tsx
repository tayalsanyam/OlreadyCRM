"use client";

import { useEffect, useState } from "react";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { ActivationWizard } from "@/components/activation/ActivationWizard";

type Row = {
  id: string;
  muaName: string;
  muaCity: string;
  muaType: string;
  assignedSalesName: string | null;
  trainingCompletedAt: string;
  daysSinceTraining: number;
};

export default function ActivationQueuePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/activation/queue")
      .then((r) => r.json())
      .then((j: { data?: Row[] }) => setRows(j.data ?? []));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-brand">Activation Queue</h1>
        <p className="text-sm text-slate-muted">Training-complete MUAs waiting for activation.</p>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>MUA</TH><TH>City</TH><TH>Type</TH><TH>Salesperson</TH><TH>Training completed</TH><TH>Days pending</TH><TH>Action</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD>{r.muaName}</TD>
              <TD>{r.muaCity}</TD>
              <TD>{r.muaType}</TD>
              <TD>{r.assignedSalesName ?? "—"}</TD>
              <TD>{new Date(r.trainingCompletedAt).toLocaleDateString("en-IN")}</TD>
              <TD>{r.daysSinceTraining}</TD>
              <TD>
                <Button size="sm" onClick={() => setActivePipelineId(r.id)}>
                  Start Activation
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <ActivationWizard
        open={Boolean(activePipelineId)}
        onClose={() => setActivePipelineId(null)}
        pipelineId={activePipelineId ?? ""}
        onDone={() => {
          setActivePipelineId(null);
          void fetch("/api/activation/queue")
            .then((r) => r.json())
            .then((j: { data?: Row[] }) => setRows(j.data ?? []));
        }}
      />
    </div>
  );
}
