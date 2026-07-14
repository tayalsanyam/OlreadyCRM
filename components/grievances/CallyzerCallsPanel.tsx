"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";

type CallRow = {
  id: string;
  calledAt: string;
  direction: string | null;
  durationSec: number | null;
  outcome: string | null;
  recordingUrl: string | null;
  staffName: string | null;
  afterTicket: boolean;
};

export function CallyzerCallsPanel({ ticketId }: { ticketId: string }) {
  const { toast } = useToast();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/callyzer-calls`);
    const json = await res.json();
    setLoading(false);
    setLoaded(true);
    if (!res.ok) {
      toast(json.error ?? "Failed to load calls", "error");
      return;
    }
    setCalls(json.data?.calls ?? []);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-brand">Call logs</h2>
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Loading…" : loaded ? "Refresh" : "Load calls"}
        </Button>
      </div>
      {!loaded ? (
        <p className="text-sm text-slate-muted">Load Callyzer / call history for linked MUA</p>
      ) : calls.length === 0 ? (
        <p className="text-sm text-slate-muted">No calls found for this MUA</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
          {calls.map((c) => (
            <li
              key={c.id}
              className={`rounded border p-2 ${c.afterTicket ? "border-amber-200 bg-amber-50/50" : "border-slate-100"}`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">{c.staffName ?? "Unknown"}</span>
                <span className="text-xs text-slate-muted">{formatDate(c.calledAt)}</span>
              </div>
              <div className="text-xs text-slate-muted">
                {c.direction ?? "—"} · {c.durationSec ?? 0}s · {c.outcome ?? "—"}
                {c.afterTicket && " · after ticket opened"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
