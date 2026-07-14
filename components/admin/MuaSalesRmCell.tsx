"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import { ADMIN_REASSIGN_STAGE_OPTIONS } from "@/lib/admin-reassign-stages";
import { mapAssignableStaffFromApi } from "@/lib/sales-pipeline-assignee";

type SalesStaff = { id: string; name: string };

export function MuaSalesRmCell({
  m,
  staff,
  onUpdated,
}: {
  m: AdminMuaListItem;
  staff: SalesStaff[];
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stageMode, setStageMode] = useState<"keep" | "set">("keep");
  const [stagePick, setStagePick] = useState("");

  const assignedName = useMemo(() => {
    if (m.salesRmName) return m.salesRmName;
    if (m.salesRmId) {
      return staff.find((s) => s.id === m.salesRmId)?.name ?? null;
    }
    return null;
  }, [m.salesRmId, m.salesRmName, staff]);

  const defaultPick = useMemo(
    () => (m.salesRmId && staff.some((s) => s.id === m.salesRmId) ? m.salesRmId : ""),
    [m.salesRmId, staff],
  );

  useEffect(() => {
    setPick(defaultPick);
  }, [defaultPick, m.id]);

  const pickedName = staff.find((s) => s.id === pick)?.name ?? "—";
  const isAssigned = Boolean(m.salesRmId || assignedName);
  const pickChanged = pick && pick !== m.salesRmId;

  async function submitAssign() {
    if (!pick || !m.salesPipelineId) {
      toast("Select a Sales RM or TL", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sales/unassigned/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineId: m.salesPipelineId,
          salesRmId: pick,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(json.error ?? "Assign failed", "error");
        return;
      }
      toast("Sales RM assigned");
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function submitReassign() {
    if (!pick || !m.salesPipelineId) return;
    if (stageMode === "set" && !stagePick) {
      toast("Select a stage or choose Keep current stage", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sales/assigned/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineId: m.salesPipelineId,
          salesRmId: pick,
          ...(stageMode === "set" && stagePick ? { stage: stagePick } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(json.error ?? "Reassign failed", "error");
        return;
      }
      toast("Sales RM updated");
      setConfirmOpen(false);
      setStageMode("keep");
      setStagePick("");
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  function onPrimaryClick() {
    if (!pick || !m.salesPipelineId) {
      toast("Select a Sales RM or TL", "error");
      return;
    }
    if (isAssigned && pickChanged) {
      setStageMode("keep");
      setStagePick("");
      setConfirmOpen(true);
      return;
    }
    if (!isAssigned) {
      void submitAssign();
    }
  }

  if (m.hasRejectedSalesPipeline) {
    return (
      <div className="min-w-[160px] space-y-0.5">
        <p className="text-xs font-medium text-amber-800">Rejected queue</p>
        <Link href="/admin/sales/rejected" className="text-[11px] text-accent hover:underline">
          Re-assign or junk
          {m.rejectionReason ? ` · ${m.rejectionReason}` : ""}
        </Link>
      </div>
    );
  }

  if (!m.hasActiveSalesPipeline) {
    return <span className="text-xs font-medium text-amber-700">No pipeline</span>;
  }

  if (m.status === "inactive") {
    return (
      <div className="min-w-[160px] space-y-0.5">
        <p className="text-xs text-slate-muted">Inactive roster</p>
        <p className="text-[11px] text-slate-muted">Activate to assign Sales RM</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-w-[200px] space-y-1">
        {isAssigned && assignedName ? (
          <p className="text-sm font-medium text-slate-800">{assignedName}</p>
        ) : (
          <p className="text-sm font-medium text-amber-700">Unassigned</p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <select
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
            value={pick}
            disabled={busy}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">{isAssigned ? "Change to…" : "Sales RM / TL…"}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy || !pick || (isAssigned && !pickChanged)}
            onClick={onPrimaryClick}
          >
            {isAssigned ? "Reassign" : "Assign"}
          </Button>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        title="Confirm reassignment"
      >
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-slate-muted">MUA:</span> {m.name}
            </p>
            <p>
              <span className="text-slate-muted">From:</span> {assignedName ?? "—"}
            </p>
            <p>
              <span className="text-slate-muted">To:</span> {pickedName}
            </p>
            <p>
              <span className="text-slate-muted">Current stage:</span>{" "}
              {m.salesPipelineStage ?? "—"}
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Stage on handoff</p>
            <select
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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

          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submitReassign()}>
              {busy ? "Saving…" : "Confirm reassign"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function useAssignableSalesStaff(): SalesStaff[] {
  const [staff, setStaff] = useState<SalesStaff[]>([]);
  useEffect(() => {
    void fetch("/api/sales/assignable-rms")
      .then((r) => r.json())
      .then((json: { data?: Array<{ id: string; name: string; role: string }> }) => {
        setStaff(mapAssignableStaffFromApi(json.data ?? []));
      })
      .catch(() => setStaff([]));
  }, []);
  return staff;
}
