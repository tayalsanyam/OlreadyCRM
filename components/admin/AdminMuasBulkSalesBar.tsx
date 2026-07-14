"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import { ADMIN_REASSIGN_STAGE_OPTIONS } from "@/lib/admin-reassign-stages";

type Staff = { id: string; name: string };

type Props = {
  selected: AdminMuaListItem[];
  staff: Staff[];
  onDone: () => void;
};

function chunkPipelineIds(ids: string[], size = 100): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export function AdminMuasBulkSalesBar({ selected, staff, onDone }: Props) {
  const { toast } = useToast();
  const [assignRmId, setAssignRmId] = useState("");
  const [reassignRmId, setReassignRmId] = useState("");
  const [stageMode, setStageMode] = useState<"keep" | "set">("keep");
  const [stagePick, setStagePick] = useState("");
  const [busy, setBusy] = useState(false);

  const assignable = useMemo(
    () =>
      selected.filter(
        (m) =>
          m.status === "active" &&
          m.hasActiveSalesPipeline &&
          m.salesPipelineId &&
          !m.salesRmId,
      ),
    [selected],
  );

  const reassignable = useMemo(
    () =>
      selected.filter(
        (m) =>
          m.status === "active" &&
          m.hasActiveSalesPipeline &&
          m.salesPipelineId &&
          Boolean(m.salesRmId),
      ),
    [selected],
  );

  async function bulkAssign() {
    if (!assignRmId || !assignable.length) return;
    const pipelineIds = assignable
      .map((m) => m.salesPipelineId)
      .filter((id): id is string => Boolean(id));
    setBusy(true);
    try {
      let assigned = 0;
      for (const batch of chunkPipelineIds(pipelineIds)) {
        const res = await fetch("/api/admin/sales/unassigned/bulk-assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineIds: batch, salesRmId: assignRmId }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          data?: { assigned?: number };
        };
        if (!res.ok) {
          toast(json.error ?? "Bulk assign failed", "error");
          if (assigned > 0) onDone();
          return;
        }
        assigned += json.data?.assigned ?? 0;
      }
      toast(`Assigned ${assigned} pipeline(s)`);
      setAssignRmId("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function bulkReassign() {
    if (!reassignRmId || !reassignable.length) return;
    if (stageMode === "set" && !stagePick) {
      toast("Select a stage or choose Keep current stage", "error");
      return;
    }
    const pipelineIds = reassignable
      .map((m) => m.salesPipelineId)
      .filter((id): id is string => Boolean(id));
    setBusy(true);
    try {
      let reassigned = 0;
      for (const batch of chunkPipelineIds(pipelineIds)) {
        const res = await fetch("/api/admin/sales/assigned/bulk-reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pipelineIds: batch,
            salesRmId: reassignRmId,
            ...(stageMode === "set" && stagePick ? { stage: stagePick } : {}),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          data?: { reassigned?: number };
        };
        if (!res.ok) {
          toast(json.error ?? "Bulk reassign failed", "error");
          if (reassigned > 0) onDone();
          return;
        }
        reassigned += json.data?.reassigned ?? 0;
      }
      toast(`Reassigned ${reassigned} pipeline(s)`);
      setReassignRmId("");
      setStageMode("keep");
      setStagePick("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!assignable.length && !reassignable.length) return null;

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-brand/20 pt-3">
      {assignable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              Bulk assign ({assignable.length})
            </label>
            <select
              className="min-w-[160px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              value={assignRmId}
              disabled={busy}
              onChange={(e) => setAssignRmId(e.target.value)}
            >
              <option value="">Sales RM / TL…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={busy || !assignRmId} onClick={() => void bulkAssign()}>
            Bulk assign
          </Button>
        </div>
      )}
      {reassignable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              Bulk reassign ({reassignable.length})
            </label>
            <select
              className="min-w-[160px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              value={reassignRmId}
              disabled={busy}
              onChange={(e) => setReassignRmId(e.target.value)}
            >
              <option value="">New Sales RM / TL…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Stage</label>
            <select
              className="min-w-[180px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              value={stageMode === "keep" ? "__keep__" : stagePick}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value === "__keep__") {
                  setStageMode("keep");
                  setStagePick("");
                } else {
                  setStageMode("set");
                  setStagePick(e.target.value);
                }
              }}
            >
              <option value="__keep__">Keep current stage</option>
              {ADMIN_REASSIGN_STAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  Set to: {s}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !reassignRmId}
            onClick={() => void bulkReassign()}
          >
            Bulk reassign
          </Button>
        </div>
      )}
    </div>
  );
}
