"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ActivationWizard } from "@/components/activation/ActivationWizard";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { formatInr } from "@/lib/sales-deal-payment";
import { cn } from "@/lib/utils";

type PlanFields = {
  plan: string | null;
  leadCap: number | null;
  leadBudget: string | null;
  durationStart: string | null;
  durationEnd: string | null;
  quotedAmount: number | null;
};

type PendingRow = PlanFields & {
  id: string;
  muaName: string;
  muaCity: string;
  muaType: string;
  assignedSalesName: string | null;
  salesClosedByName: string | null;
  trainingCompletedAt: string;
  daysPending: number;
  profileLinkVerified: boolean;
  invoiceGenerated: boolean;
  contractGenerated: boolean;
  hasContract: boolean;
};

type SentBackRow = PlanFields & {
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
};

function formatPlanCell(row: PlanFields): string {
  const parts = [
    row.plan,
    row.leadCap ? `${row.leadCap} leads` : null,
    row.leadBudget,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function activationProgress(row: PendingRow): string {
  const steps: string[] = [];
  if (row.profileLinkVerified) steps.push("Profile");
  if (row.invoiceGenerated) steps.push("Invoice");
  if (row.contractGenerated) steps.push("Contract");
  if (row.hasContract) steps.push("Signed");
  return steps.length ? steps.join(" → ") : "Not started";
}

export function ActivationAdminWorkbench() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "sent-back" ? "sent-back" : "pending";
  const [tab, setTab] = useState<"pending" | "sent-back">(initialTab);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [sentBack, setSentBack] = useState<SentBackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/sales/activation");
    const json = (await res.json()) as {
      data?: { pending?: PendingRow[]; sentBack?: SentBackRow[] };
      error?: string;
    };
    setPending(json.data?.pending ?? []);
    setSentBack(json.data?.sentBack ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Activation</h1>
          <p className="text-sm text-slate-muted">
            Monitor pending activations and deals sent back to sales. Process activation directly — no tasks are
            assigned to you.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium",
            tab === "pending" ? "bg-white text-brand shadow-sm" : "text-slate-muted",
          )}
        >
          Pending ({pending.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("sent-back")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium",
            tab === "sent-back" ? "bg-white text-brand shadow-sm" : "text-slate-muted",
          )}
        >
          Sent back ({sentBack.length})
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-muted">
            No MUAs are waiting for activation.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>MUA</TH>
                <TH>Plan</TH>
                <TH>Deal</TH>
                <TH>Salesperson</TH>
                <TH>Days pending</TH>
                <TH>Progress</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {pending.map((r) => {
                const salesperson = r.assignedSalesName ?? r.salesClosedByName ?? "—";
                const overdue = r.daysPending >= 2;
                return (
                  <TR key={r.id}>
                    <TD>
                      <p className="font-medium text-text">{r.muaName}</p>
                      <p className="text-xs text-slate-muted">
                        {[r.muaCity, salesPipelineMuaTypeLabel(r.muaType)].filter(Boolean).join(" · ")}
                      </p>
                    </TD>
                    <TD className="text-xs">{formatPlanCell(r)}</TD>
                    <TD className="text-xs">
                      {r.quotedAmount && r.quotedAmount > 0 ? formatInr(Number(r.quotedAmount)) : "—"}
                    </TD>
                    <TD>{salesperson}</TD>
                    <TD className={overdue ? "font-semibold text-amber-700" : ""}>{r.daysPending}</TD>
                    <TD className="text-xs text-slate-muted">{activationProgress(r)}</TD>
                    <TD className="text-right">
                      <Button size="sm" onClick={() => setActivePipelineId(r.id)}>
                        Process
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )
      ) : sentBack.length === 0 ? (
        <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-muted">
          No activations are currently sent back to sales.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>Plan</TH>
              <TH>Deal</TH>
              <TH>Salesperson</TH>
              <TH>Sent back</TH>
              <TH>Days waiting</TH>
              <TH>Reason</TH>
              <TH>Status</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {sentBack.map((r) => {
              const salesperson = r.assignedSalesName ?? r.salesClosedByName ?? "—";
              return (
                <TR key={r.id}>
                  <TD>
                    <p className="font-medium text-text">{r.muaName}</p>
                    <p className="text-xs text-slate-muted">
                      {[r.muaCity, salesPipelineMuaTypeLabel(r.muaType)].filter(Boolean).join(" · ")}
                    </p>
                  </TD>
                  <TD className="text-xs">{formatPlanCell(r)}</TD>
                  <TD className="text-xs">
                    {r.quotedAmount && r.quotedAmount > 0 ? formatInr(Number(r.quotedAmount)) : "—"}
                  </TD>
                  <TD>{salesperson}</TD>
                  <TD className="text-xs">{new Date(r.sentBackAt).toLocaleString("en-IN")}</TD>
                  <TD className={r.daysSinceSendBack >= 1 ? "font-semibold text-amber-700" : ""}>
                    {r.daysSinceSendBack}
                  </TD>
                  <TD className="max-w-xs">
                    <p className="line-clamp-3 text-xs text-slate-700">{r.sentBackNote ?? "—"}</p>
                  </TD>
                  <TD>
                    <Badge variant="muted">{r.salesTaskPending ? "Sales task open" : "Awaiting sales"}</Badge>
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
