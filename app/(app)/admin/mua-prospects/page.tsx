"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

type ProspectRow = {
  id: string;
  displayId: string | null;
  brideName: string | null;
  nonOlreadyMuaName: string;
  instaId: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  taskStatus: string | null;
  createdAt: string;
};

const STATUS_FILTERS = ["all", "pending", "collected", "closed"] as const;

export default function AdminMuaProspectsPage() {
  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/mua-prospects")
      .then((r) => r.json())
      .then((j: { data: ProspectRow[] }) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  function exportCsv() {
    window.open("/api/admin/mua-prospects?format=csv", "_blank");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">MUA Prospects</h1>
        <AdminExportCsvButton apiPath="/api/admin/mua-prospects" />
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize",
              statusFilter === s
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-700"
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>MUA name</TH>
              <TH>Lead</TH>
              <TH>Insta</TH>
              <TH>Phone</TH>
              <TH>City</TH>
              <TH>Status</TH>
              <TH>Task</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => (
              <TR key={r.id}>
                <TD>{r.nonOlreadyMuaName}</TD>
                <TD>
                  {r.displayId ?? "—"}
                  {r.brideName ? ` · ${r.brideName}` : ""}
                </TD>
                <TD>{r.instaId ?? "—"}</TD>
                <TD>{r.phone ?? "—"}</TD>
                <TD>{r.city ?? "—"}</TD>
                <TD>
                  <Badge>{r.status}</Badge>
                </TD>
                <TD>{r.taskStatus ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
