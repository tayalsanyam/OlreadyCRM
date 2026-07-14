"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import type { LeadFull } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";

interface SelectLeadModalProps {
  open: boolean;
  onClose: () => void;
  queueStatus: "assigned" | "commissionRm";
  region?: string;
  onSelect: (lead: LeadFull) => void;
}

export function SelectLeadModal({
  open,
  onClose,
  queueStatus,
  region,
  onSelect,
}: SelectLeadModalProps) {
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadFull[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams({
      status: queueStatus === "commissionRm" ? "commission_rm" : "assigned",
      pageSize: "100",
    });
    if (region) params.set("region", region);
    void fetch(`/api/leads/queue?${params}`)
      .then((r) => r.json())
      .then((json: { data: PaginatedResult<LeadFull> | null }) => {
        setLeads(json.data?.data ?? []);
        setLoading(false);
      });
  }, [open, queueStatus, region]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.brideName.toLowerCase().includes(q) ||
        l.displayId.toLowerCase().includes(q)
    );
  }, [leads, search]);

  return (
    <Modal open={open} onClose={onClose} title="Select lead">
      <Input
        label="Search"
        placeholder="Bride name or display ID"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-slate-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-muted">No leads found</p>
        ) : (
          filtered.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => {
                onSelect(lead);
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-accent hover:bg-accent/5"
            >
              <span className="font-medium text-brand">{lead.brideName}</span>
              <span className="font-mono text-xs text-slate-muted">{lead.displayId}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
