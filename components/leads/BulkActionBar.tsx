"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import type { LeadFull } from "@/lib/types";
import { BUDGET_TIER_LABELS, URGENCY_LABELS } from "@/lib/types";
import { notifyLeadRemovedFromQueue } from "@/lib/queue-events";

interface RmOption {
  id: string;
  name: string;
  region: string;
}

interface BulkActionBarProps {
  selectedIds: string[];
  leads: LeadFull[];
  onClearSelection: () => void;
  onDone: () => void;
  showReassign?: boolean;
}

export function BulkActionBar({
  selectedIds,
  leads,
  onClearSelection,
  onDone,
  showReassign = false,
}: BulkActionBarProps) {
  const { toast } = useToast();
  const [rms, setRms] = useState<RmOption[]>([]);
  const [rmId, setRmId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!showReassign) return;
    void fetch("/api/admin/rms")
      .then((r) => r.json())
      .then((json: { data: RmOption[] }) => setRms(json.data ?? []));
  }, [showReassign]);

  const selectedLeads = leads.filter((l) => selectedIds.includes(l.id));

  async function bulkReassign() {
    if (!rmId) return;
    setBusy(true);
    const res = await fetch("/api/leads/bulk-reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: selectedIds, rmId }),
    });
    const json = (await res.json()) as { data: { updated: number } | null };
    setBusy(false);
    if (res.ok && json.data) {
      toast(`Reassigned ${json.data.updated} leads`);
      onDone();
    } else {
      toast("Reassign failed", "error");
    }
  }

  async function bulkNotInterested() {
    if (!confirm(`Mark ${selectedIds.length} leads as not interested?`)) return;
    setBusy(true);
    const res = await fetch("/api/leads/bulk-not-interested", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: selectedIds }),
    });
    const json = (await res.json()) as { data: { updated: number } | null };
    setBusy(false);
    if (res.ok && json.data) {
      toast(`Updated ${json.data.updated} leads`);
      for (const id of selectedIds) notifyLeadRemovedFromQueue(id);
      onDone();
    } else {
      toast("Bulk update failed", "error");
    }
  }

  function exportCsv() {
    const header = [
      "Display ID",
      "Bride Name",
      "Phone",
      "City",
      "Region",
      "Tier",
      "Event Date",
      "Status",
      "Urgency Band",
      "Assigned RM",
      "Days To Event",
    ];
    const rows = selectedLeads.map((l) => [
      l.displayId,
      l.brideName,
      l.phone,
      l.city,
      l.region,
      BUDGET_TIER_LABELS[l.budgetTier],
      l.eventDate,
      l.status,
      URGENCY_LABELS[l.urgencyBand],
      l.assignedRmName ?? "",
      String(l.daysToEvent),
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `olready-leads-export-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-brand">
          ✓ {selectedIds.length} lead{selectedIds.length === 1 ? "" : "s"} selected
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          className="text-sm text-slate-muted hover:text-brand"
          aria-label="Clear selection"
        >
          ×
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showReassign && (
            <div className="flex items-center gap-2">
              <Select
                value={rmId}
                onChange={(e) => setRmId(e.target.value)}
                className="min-w-[140px] text-sm"
                options={[
                  { value: "", label: "Reassign RM…" },
                  ...rms.map((rm) => ({
                    value: rm.id,
                    label: `${rm.name} (${rm.region})`,
                  })),
                ]}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!rmId || busy}
                onClick={() => void bulkReassign()}
              >
                Apply
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void bulkNotInterested()}
          >
            Mark Not Interested
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
