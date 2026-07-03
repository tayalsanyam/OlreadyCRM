"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { ActiveMuaProfile } from "@/components/sales/ActiveMuaProfile";

type Row = {
  id: string;
  name: string;
  city: string;
  planTier: string | null;
  planExpiry: string | null;
  salesClosedByName: string | null;
  assignedRmName: string | null;
  salesClosedAt: string | null;
  dealAmount: number | null;
  pipelineId: string | null;
  daysUntilExpiry: number | null;
};

type ExpiryFilter = "all" | "expiring30";

export default function SalesActivePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    void fetch("/api/sales/active", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: Row[]; error?: string | null };
        if (!r.ok || j.error) throw new Error(j.error ?? `Failed (${r.status})`);
        setRows(j.data ?? []);
      })
      .catch((e: Error) => {
        setRows([]);
        setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const expiringCount = useMemo(
    () => rows.filter((r) => r.daysUntilExpiry !== null && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30).length,
    [rows],
  );

  const filtered = useMemo(() => {
    let next = [...rows];
    if (expiryFilter === "expiring30") {
      next = next.filter(
        (r) => r.daysUntilExpiry !== null && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30,
      );
    }
    const s = q.trim().toLowerCase();
    if (s) {
      next = next.filter((r) => `${r.name} ${r.city} ${r.planTier ?? ""}`.toLowerCase().includes(s));
    }
    return next;
  }, [rows, q, expiryFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Active MUAs</h1>
          <p className="text-sm text-slate-muted">
            Customers on a live plan that you closed. Read-only — day-to-day work is in RM CRM.
          </p>
        </div>
        {expiringCount > 0 ? (
          <Link
            href="/sales/pipeline?mua_type=renewal"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            {expiringCount} expiring in 30 days → Renewal pipeline
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpiryFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            expiryFilter === "all" ? "border-brand bg-brand text-white" : "border-slate-200 bg-white"
          }`}
        >
          All ({rows.length})
        </button>
        <button
          type="button"
          onClick={() => setExpiryFilter("expiring30")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            expiryFilter === "expiring30"
              ? "border-amber-600 bg-amber-600 text-white"
              : "border-slate-200 bg-white"
          }`}
        >
          Expiring ≤30d ({expiringCount})
        </button>
        <Input
          className="max-w-xs"
          placeholder="Search name, city, plan…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-muted">Loading active MUAs…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-brand">
            {rows.length === 0 ? "No customers closed by you yet" : "No MUAs match your filters"}
          </p>
          <p className="mt-1 text-xs text-slate-muted">
            {rows.length === 0
              ? "When you close a deal, on-plan customers appear here for reference and renewal tracking."
              : "Try clearing search or the expiring filter."}
          </p>
          {rows.length === 0 ? (
            <Link href="/sales/pipeline" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              Go to pipeline
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-muted">
            Showing {filtered.length} of {rows.length} on-plan customer{rows.length === 1 ? "" : "s"}
          </p>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>City</TH>
                <TH>Plan</TH>
                <TH>Expiry</TH>
                <TH>Days left</TH>
                <TH>Assigned RM</TH>
                <TH>Closed by</TH>
                <TH>Deal value</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((r) => {
                const expiringSoon =
                  r.daysUntilExpiry !== null && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30;
                return (
                  <TR
                    key={r.id}
                    className={expiringSoon ? "border-l-4 border-l-amber-500 bg-amber-50/40" : undefined}
                  >
                    <TD>
                      <button
                        type="button"
                        className="font-medium text-accent hover:underline"
                        onClick={() => setSelected(r)}
                      >
                        {r.name}
                      </button>
                    </TD>
                    <TD>{r.city}</TD>
                    <TD>{r.planTier ?? "—"}</TD>
                    <TD>{r.planExpiry ? new Date(r.planExpiry).toLocaleDateString("en-IN") : "—"}</TD>
                    <TD className={expiringSoon ? "font-semibold text-amber-800" : ""}>
                      {r.daysUntilExpiry !== null ? `${r.daysUntilExpiry}d` : "—"}
                    </TD>
                    <TD>{r.assignedRmName ?? "—"}</TD>
                    <TD>{r.salesClosedByName ?? "—"}</TD>
                    <TD>{typeof r.dealAmount === "number" ? `₹${r.dealAmount.toLocaleString("en-IN")}` : "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </>
      )}

      <ActiveMuaProfile open={Boolean(selected)} onClose={() => setSelected(null)} row={selected} />
    </div>
  );
}
