"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { mapAssignableStaffFromApi } from "@/lib/sales-pipeline-assignee";

type ChurnedRow = {
  muaId: string;
  muaName: string;
  displayId?: string | null;
  lastPlan?: string | null;
  salesClosedByName?: string | null;
  daysSincePlanExpiry?: number;
};

export function ChurnedReengagePanel({
  rows,
  onDone,
}: {
  rows: ChurnedRow[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const uniqueRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (!r.muaId || seen.has(r.muaId)) return false;
      seen.add(r.muaId);
      return true;
    });
  }, [rows]);

  useEffect(() => {
    void fetch("/api/sales/assignable-rms")
      .then((r) => r.json())
      .then((j: { data?: Array<{ id: string; name: string; role: string }> }) => {
        setStaff(mapAssignableStaffFromApi(j.data ?? []));
      });
  }, []);

  async function run() {
    if (!selected.size) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/sales/re-engage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muaIds: [...selected], assignedTo: assignTo || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(json?.error ?? "Re-engagement failed");
      return;
    }
    const created = json?.data?.created?.length ?? 0;
    const skipped = json?.data?.skipped?.length ?? 0;
    setMessage(`Created ${created} pipeline(s). Skipped ${skipped}.`);
    setSelected(new Set());
    onDone();
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
      <p className="text-sm font-semibold text-brand">Re-engagement workflow</p>
      <p className="mt-1 text-xs text-slate-muted">
        Push selected expired-plan MUAs back into the sales pipeline (re-engage segment).
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          value={assignTo}
          onChange={(e) => setAssignTo(e.target.value)}
        >
          <option value="">Assign to (optional)</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <Button size="sm" onClick={() => setSelected(new Set(uniqueRows.map((r) => r.muaId)))}>
          Select all on page
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
          Clear
        </Button>
        <Button size="sm" disabled={busy || !selected.size} onClick={() => void run()}>
          {busy ? "Working…" : `Re-engage (${selected.size})`}
        </Button>
      </div>
      {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}
      <div className="mt-2 max-h-40 overflow-y-auto text-xs">
        {uniqueRows.map((r) => (
          <label key={r.muaId} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={selected.has(r.muaId)}
              onChange={(e) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(r.muaId);
                  else next.delete(r.muaId);
                  return next;
                });
              }}
            />
            {r.muaName}
            {r.displayId ? ` · ${r.displayId}` : ""}
            {r.lastPlan ? ` · ${r.lastPlan}` : ""}
            {r.salesClosedByName ? ` · ${r.salesClosedByName}` : ""}
            {" · "}
            {r.daysSincePlanExpiry ?? 0}d since expiry
          </label>
        ))}
      </div>
    </div>
  );
}
