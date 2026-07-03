"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type CommissionRmOption = { id: string; name: string };

export function ShiftToCommissionModal({
  open,
  onClose,
  brideName,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  brideName: string;
  busy?: boolean;
  onConfirm: (commissionRmId: string) => void | Promise<void>;
}) {
  const [rms, setRms] = useState<CommissionRmOption[]>([]);
  const [selectedId, setSelectedId] = useState("");

  const load = useCallback(() => {
    void fetch("/api/staff/commission-rms")
      .then((r) => r.json())
      .then((json: { data: CommissionRmOption[] }) => setRms(json.data ?? []));
  }, []);

  useEffect(() => {
    if (open) {
      load();
      setSelectedId("");
    }
  }, [open, load]);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Shift to Commission — ${brideName}`}
    >
      <p className="text-sm text-slate-muted">
        Choose which Commission RM should take this lead.
      </p>
      {rms.length > 0 ? (
        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="text-slate-muted">Commission RM</span>
          <select
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            value={selectedId}
            disabled={busy}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Select Commission RM…</option>
            {rms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-4 text-sm text-amber-700">No active Commission RMs found.</p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy || !selectedId}
          onClick={() => void onConfirm(selectedId)}
        >
          Shift to Commission
        </Button>
      </div>
    </Modal>
  );
}
