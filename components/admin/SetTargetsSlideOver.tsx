"use client";

import { useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { currentMonthKey } from "@/lib/targets";
import type { BackendStaffRole } from "@/lib/targets";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  staff: Array<{ id: string; name: string; role: BackendStaffRole }>;
}

export function SetTargetsSlideOver({ open, onClose, onSaved, staff }: Props) {
  const [staffId, setStaffId] = useState("");
  const [month, setMonth] = useState(currentMonthKey());
  const [targetBookings, setTargetBookings] = useState("6");
  const [targetLeadsWorked, setTargetLeadsWorked] = useState("10");
  const [targetAvgMuas, setTargetAvgMuas] = useState("3");
  const [targetCommission, setTargetCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regional = staff.filter((s) => s.role === "regional_rm");
  const commission = staff.filter((s) => s.role === "commission_rm");
  const selected = staff.find((s) => s.id === staffId);
  const isCommissionRm = selected?.role === "commission_rm";

  async function save() {
    if (!staffId) {
      setError("Select a team member");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId,
        month,
        targetBookings: Number(targetBookings),
        targetLeadsWorked: Number(targetLeadsWorked),
        targetAvgMuasPerLead: Number(targetAvgMuas),
        targetCommission: isCommissionRm && targetCommission.trim()
          ? Number(targetCommission)
          : undefined,
        notes: notes || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Failed to save");
      return;
    }
    onSaved();
  }

  return (
    <SlideOver open={open} onClose={onClose} title="Set monthly targets">
      <div className="space-y-4 p-1">
        <label className="block text-sm">
          <span className="text-slate-muted">Team member</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">Select…</option>
            {regional.length > 0 && (
              <optgroup label="Regional RMs">
                {regional.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
            {commission.length > 0 && (
              <optgroup label="Commission RMs">
                {commission.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <p className="text-xs text-slate-muted">
          Targets apply to both regional and commission RMs — bookings, distinct leads pushed, and
          average MUAs offered per lead.
        </p>
        <label className="block text-sm">
          <span className="text-slate-muted">Month</span>
          <Input
            type="month"
            className="mt-1"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-muted">Target bookings</span>
          <Input
            type="number"
            className="mt-1"
            value={targetBookings}
            onChange={(e) => setTargetBookings(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-muted">Target leads worked (distinct leads pushed)</span>
          <Input
            type="number"
            className="mt-1"
            value={targetLeadsWorked}
            onChange={(e) => setTargetLeadsWorked(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-muted">Target avg MUAs per lead</span>
          <Input
            type="number"
            step="0.1"
            className="mt-1"
            value={targetAvgMuas}
            onChange={(e) => setTargetAvgMuas(e.target.value)}
          />
        </label>
        {isCommissionRm && (
          <label className="block text-sm">
            <span className="text-slate-muted">Target commission (INR, monthly)</span>
            <Input
              type="number"
              className="mt-1"
              value={targetCommission}
              onChange={(e) => setTargetCommission(e.target.value)}
              placeholder="e.g. 500000"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-slate-muted">Notes</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="mt-6 flex gap-2">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save targets"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </SlideOver>
  );
}
