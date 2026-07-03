"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { mapAssignableStaffFromApi } from "@/lib/sales-pipeline-assignee";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { cn } from "@/lib/utils";

export type RejectedRow = {
  id: string;
  muaName: string;
  muaCity: string;
  muaSource: string | null;
  muaType: string;
  assignedToName: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  rejectedAt: string | null;
  rejectedByName: string | null;
  rejectionCount: number;
  daysInRejected: number;
};

type SalesRm = { id: string; name: string };

export function SalesRejectedQueue({
  listUrl,
  role,
  exportApiPath,
  title = "Rejected MUAs",
  description = "Review rejected pipeline records. Re-assign to retry (history is kept). Second reject auto-junks by customer history.",
}: {
  listUrl: string;
  role: "admin" | "salesTl";
  exportApiPath?: string;
  title?: string;
  description?: string;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RejectedRow[]>([]);
  const [rms, setRms] = useState<SalesRm[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRm, setBulkRm] = useState("");
  const [junkReason, setJunkReason] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [listRes, usersRes] = await Promise.all([
      fetch(listUrl).then((r) => r.json()),
      fetch("/api/sales/assignable-rms").then((r) => r.json()),
    ]);
    setRows(listRes.data ?? []);
    const users = (usersRes.data ?? []) as Array<{ id: string; role: string; name: string }>;
    setRms(mapAssignableStaffFromApi(users));
    setSelected(new Set());
    setLoading(false);
  }, [listUrl, role]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: "reassign" | "junk", pipelineIds: string[], salesRmId?: string) {
    if (action === "reassign" && pipelineIds.length > 1) {
      const rmName = rms.find((r) => r.id === salesRmId)?.name ?? "selected salesperson";
      if (
        !confirm(
          `Re-assign ${pipelineIds.length} rejected MUA(s) to ${rmName}?\n\nOnly the selected row(s) will change.`,
        )
      ) {
        return;
      }
    }
    const res = await fetch("/api/sales/rejected/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        pipelineIds,
        salesRmId,
        junkReason: action === "junk" ? junkReason || "Not viable — archived" : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(json.error ?? "Action failed", "error");
      return;
    }
    const ok = (json.data?.results ?? []).filter((r: { ok: boolean }) => r.ok).length;
    toast(action === "junk" ? `Junked ${ok} record(s)` : `Re-assigned ${ok} record(s)`);
    void load();
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">{title}</h1>
          <p className="text-sm text-slate-muted">{description}</p>
        </div>
        {exportApiPath ? <AdminExportCsvButton apiPath={exportApiPath} /> : null}
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm text-violet-950">
        <span className="font-semibold">{rows.length}</span> rejected MUAs awaiting review.
        Junked records move to the{" "}
        {role === "admin" ? (
          <Link href="/admin/muas/junk" className="font-medium text-accent underline">
            Junk reference
          </Link>
        ) : (
          "junk archive"
        )}{" "}
        and leave the active pipeline.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={bulkRm}
          onChange={(e) => setBulkRm(e.target.value)}
        >
          <option value="">Bulk re-assign selected to…</option>
          {rms.map((rm) => (
            <option key={rm.id} value={rm.id}>
              {rm.name}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          disabled={!bulkRm || selected.size === 0}
          onClick={() => void runAction("reassign", [...selected], bulkRm)}
        >
          Re-assign ({selected.size})
        </Button>
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Junk reason (optional)"
          value={junkReason}
          onChange={(e) => setJunkReason(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={selected.size === 0}
          onClick={() => void runAction("junk", [...selected])}
        >
          Junk selected ({selected.size})
        </Button>
        <Button variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  aria-label="Select all"
                />
              </TH>
              <TH>MUA</TH>
              <TH>Type</TH>
              <TH>Salesperson</TH>
              <TH>Rejections</TH>
              <TH>Rejection reason</TH>
              <TH>Rejected</TH>
              <TH>Days</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={9} className="text-slate-muted">
                  No rejected MUAs in queue.
                </TD>
              </TR>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </TD>
                  <TD>
                    <p className="font-medium">{r.muaName}</p>
                    <p className="text-xs text-slate-muted">
                      {r.muaCity}
                      {r.muaSource ? ` · ${r.muaSource}` : ""}
                    </p>
                    {r.rejectionNote ? (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{r.rejectionNote}</p>
                    ) : null}
                  </TD>
                  <TD>{salesPipelineMuaTypeLabel(r.muaType)}</TD>
                  <TD>{r.assignedToName ?? "—"}</TD>
                  <TD className={cn(r.rejectionCount >= 2 && "font-semibold text-amber-800")}>
                    {r.rejectionCount}
                  </TD>
                  <TD>{r.rejectionReason ?? "—"}</TD>
                  <TD className="text-xs text-slate-muted">
                    {r.rejectedAt ? new Date(r.rejectedAt).toLocaleDateString("en-IN") : "—"}
                    {r.rejectedByName ? ` · ${r.rejectedByName}` : ""}
                  </TD>
                  <TD className={cn(r.daysInRejected >= 7 && "font-semibold text-amber-700")}>
                    {r.daysInRejected}
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        className="rounded border px-2 py-1 text-xs"
                        value={pick[r.id] ?? ""}
                        onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}
                      >
                        <option value="">Re-assign to…</option>
                        {rms.map((rm) => (
                          <option key={rm.id} value={rm.id}>
                            {rm.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!pick[r.id]}
                        onClick={() => void runAction("reassign", [r.id], pick[r.id])}
                      >
                        Re-assign
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void runAction("junk", [r.id])}
                      >
                        Junk
                      </Button>
                    </div>
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
