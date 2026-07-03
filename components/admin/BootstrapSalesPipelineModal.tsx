"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import {
  BOOTSTRAP_PIPELINE_BATCH_SIZE,
  chunkIds,
} from "@/lib/bootstrap-sales-pipeline-constants";
import { mapAssignableStaffFromApi } from "@/lib/sales-pipeline-assignee";
import { useToast } from "@/components/ui/Toast";

type SalesRm = { id: string; name: string };

type BootstrapResult = {
  created: Array<{ muaId: string; pipelineId: string }>;
  assigned: number;
  skipped: Array<{ muaId: string; reason: string }>;
};

interface BootstrapSalesPipelineModalProps {
  open: boolean;
  onClose: () => void;
  muas: AdminMuaListItem[];
  onSuccess: () => void;
}

export function BootstrapSalesPipelineModal({
  open,
  onClose,
  muas,
  onSuccess,
}: BootstrapSalesPipelineModalProps) {
  const { toast } = useToast();
  const [salesRmId, setSalesRmId] = useState("");
  const [rms, setRms] = useState<SalesRm[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    setSalesRmId("");
    setProgress(null);
    void fetch("/api/sales/assignable-rms")
      .then((r) => r.json())
      .then((json: { data?: Array<{ id: string; name: string; role: string }> }) => {
        setRms(mapAssignableStaffFromApi(json.data ?? []));
      });
  }, [open]);

  const stats = useMemo(() => {
    let needsPipeline = 0;
    let unassignedPipeline = 0;
    let alreadyAssigned = 0;
    for (const m of muas) {
      if (m.hasRejectedSalesPipeline) continue;
      if (!m.hasActiveSalesPipeline) {
        needsPipeline++;
      } else if (!m.salesRmName) {
        unassignedPipeline++;
      } else {
        alreadyAssigned++;
      }
    }
    return { needsPipeline, unassignedPipeline, alreadyAssigned };
  }, [muas]);

  const batchCount = Math.ceil(muas.length / BOOTSTRAP_PIPELINE_BATCH_SIZE);

  async function confirm() {
    const muaIds = muas.map((m) => m.id);
    const batches = chunkIds(muaIds);
    const total: BootstrapResult = { created: [], assigned: 0, skipped: [] };

    setSaving(true);
    setProgress({ done: 0, total: muaIds.length });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      const res = await fetch("/api/admin/muas/bootstrap-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          muaIds: batch,
          salesRmId: salesRmId || null,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        data?: BootstrapResult;
      };
      if (!res.ok) {
        setSaving(false);
        setProgress(null);
        toast(
          json.error ??
            `Batch ${i + 1}/${batches.length} failed (${total.created.length} succeeded before error)`,
          "error",
        );
        if (total.created.length > 0) onSuccess();
        return;
      }
      const data = json.data;
      if (data) {
        total.created.push(...data.created);
        total.assigned += data.assigned;
        total.skipped.push(...data.skipped);
      }
      setProgress({
        done: Math.min((i + 1) * BOOTSTRAP_PIPELINE_BATCH_SIZE, muaIds.length),
        total: muaIds.length,
      });
    }

    setSaving(false);
    setProgress(null);
    toast(
      `Pipeline: ${total.created.length} created, ${total.assigned} assigned${
        total.skipped.length ? `, ${total.skipped.length} skipped` : ""
      }`,
    );
    onSuccess();
    onClose();
  }

  const actionable = stats.needsPipeline + stats.unassignedPipeline;

  return (
    <Modal open={open} onClose={handleClose} title="Add to sales pipeline">
      <div className="space-y-4">
        <p className="text-sm text-slate-muted">
          Creates an unassigned sales pipeline for MUAs not yet in the funnel (same as Potential
          Upload). Optionally assign a Sales RM now.
        </p>

        <ul className="space-y-1 text-sm">
          <li>
            <span className="font-medium text-brand">{muas.length}</span> MUAs in this action
            {batchCount > 1 && (
              <span className="text-slate-muted"> · processed in {batchCount} batches</span>
            )}
          </li>
          {stats.needsPipeline > 0 && (
            <li>
              <span className="font-medium text-brand">{stats.needsPipeline}</span> need a new
              pipeline
            </li>
          )}
          {stats.unassignedPipeline > 0 && (
            <li>
              <span className="font-medium text-brand">{stats.unassignedPipeline}</span> already in
              pipeline, unassigned
            </li>
          )}
          {stats.alreadyAssigned > 0 && (
            <li className="text-slate-muted">
              {stats.alreadyAssigned} already have a salesperson (will be skipped)
            </li>
          )}
        </ul>

        {progress && (
          <p className="text-sm font-medium text-brand">
            Processing {progress.done} / {progress.total}…
          </p>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Sales RM (optional)</label>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={salesRmId}
            onChange={(e) => setSalesRmId(e.target.value)}
            disabled={saving}
          >
            <option value="">Leave unassigned — assign later from Unassigned MUAs</option>
            {rms.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={saving || actionable === 0}>
            {saving
              ? "Processing…"
              : salesRmId
                ? `Create & assign (${muas.length})`
                : `Add to pipeline (${muas.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
