"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AdminStaffPicker } from "@/components/grievances/StaffPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  currentLevel: number;
  onConfirm: (payload: { toLevel: number; reason: string; loopInAdminId?: string }) => Promise<boolean>;
};

const LEVEL_HELP: Record<number, string> = {
  2: "L2 — Admin attention. Notifies admin team and creates a parallel admin review task.",
  3: "L3 — Critical. Leadership escalation; use when MUA is at risk or policy exception needed.",
};

export function EscalateTicketModal({ open, onClose, currentLevel, onConfirm }: Props) {
  const [toLevel, setToLevel] = useState<2 | 3>(2);
  const [reason, setReason] = useState("");
  const [loopInAdminId, setLoopInAdminId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToLevel(currentLevel >= 2 ? 3 : 2);
    setReason("");
    setLoopInAdminId("");
    setError(null);
  }, [open, currentLevel]);

  const reset = () => {
    setToLevel(currentLevel >= 3 ? 3 : 2);
    setReason("");
    setLoopInAdminId("");
    setError(null);
  };

  const submit = async () => {
    if (reason.trim().length < 10) {
      setError("Reason required (min 10 characters)");
      return;
    }
    if (toLevel <= currentLevel) {
      setError(`Already at L${currentLevel} — pick a higher level`);
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onConfirm({
      toLevel,
      reason: reason.trim(),
      loopInAdminId: loopInAdminId || undefined,
    });
    setBusy(false);
    if (ok) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Escalate ticket (currently L${currentLevel})`}
    >
      <div className="space-y-4 p-1">
        <p className="text-sm text-slate-muted">
          <strong>L1</strong> is standard care handling. Escalating bumps the level, flags the inbox,
          and loops in admin when selected below.
        </p>

        <div className="flex gap-2">
          {([2, 3] as const).map((level) => (
            <button
              key={level}
              type="button"
              disabled={level <= currentLevel}
              onClick={() => setToLevel(level)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                toLevel === level
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-slate-200 text-slate-700"
              } ${level <= currentLevel ? "cursor-not-allowed opacity-40" : ""}`}
            >
              L{level}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-muted">{LEVEL_HELP[toLevel]}</p>

        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={3}
          placeholder="Why is this being escalated? What should admin check?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <AdminStaffPicker
          enabled={open}
          value={loopInAdminId}
          onChange={setLoopInAdminId}
          label="Loop in admin (recommended for L2+)"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Escalating…" : `Escalate to L${toLevel}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
