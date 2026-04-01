"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetcher } from "@/lib/fetcher";

type Lead = {
  id: string;
  name: string;
  city: string;
  company?: string;
  bdm: string;
  plan: string;
  status: string;
  next_follow_up?: string;
  last_modified?: string;
  leadType?: "new" | "on_plan" | "existing_customer";
  renewalStage?: "none" | "follow_up" | "rejected" | "pending" | "paid";
  planExpiry?: string;
  activePlanName?: string;
  activeOpsCoordinator?: string;
};

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const statusesParam = searchParams.get("statuses");
  const [statuses, setStatuses] = useState<string[]>(() =>
    statusesParam ? statusesParam.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  useEffect(() => {
    if (statusesParam) {
      setStatuses(statusesParam.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }, [statusesParam]);
  const [bdm, setBdm] = useState("");
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");
  const [leadType, setLeadType] = useState<string>("");
  const [renewalStage, setRenewalStage] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"inactive" | "active" | "reassign" | null>(null);
  const [reassignBdm, setReassignBdm] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const params = new URLSearchParams();
  if (statuses.length) params.set("statuses", statuses.join(","));
  if (bdm) params.set("bdm", bdm);
  if (search) params.set("search", search);
  if (datePreset) params.set("datePreset", datePreset);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (activeFilter !== "active") params.set("activeFilter", activeFilter);
  if (leadType) params.set("leadType", leadType);
  if (renewalStage) params.set("renewalStage", renewalStage);

  const url = `/api/leads?${params}`;
  const { data: leads = [], error, mutate } = useSWR(url, fetcher, { refreshInterval: 5000 });
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const { data: session } = useSWR("/api/auth/me", fetcher);

  if (error) return <div className="text-red-400">Failed to load</div>;

  const toggleStatus = (s: string) => {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const isAdmin = session?.user?.role === "admin";
  const exportUrl = `/api/leads/export?${params.toString()}`;

  const countByBdm: Record<string, number> = {};
  (leads as Lead[]).forEach((l) => {
    countByBdm[l.bdm] = (countByBdm[l.bdm] ?? 0) + 1;
  });
  const bdmCounts = Object.entries(countByBdm).sort((a, b) => b[1] - a[1]);
  const totalLeads = (leads as Lead[]).length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === (leads as Lead[]).length) setSelected(new Set());
    else setSelected(new Set((leads as Lead[]).map((l) => l.id)));
  };

  async function runBulkAction() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const action = bulkAction === "reassign" ? "reassign" : bulkAction === "active" ? "active" : "inactive";
      const body: { ids: string[]; action: string; bdm?: string } = { ids: Array.from(selected), action };
      if (action === "reassign" && reassignBdm) body.bdm = reassignBdm;
      const res = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed");
      setSelected(new Set());
      setBulkAction(null);
      setReassignBdm("");
      mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">Leads</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <a href={exportUrl} className="btn-secondary" target="_blank" rel="noopener noreferrer">
              Export CSV
            </a>
          )}
          <Link href="/leads/new" className="btn-primary">Add Lead</Link>
        </div>
      </div>

      {bdmCounts.length > 0 && (
        <div className="card flex flex-wrap gap-4 items-center">
          <span className="text-sm text-slate-400">Leads by BDM:</span>
          {bdmCounts.map(([b, c]) => (
            <span key={b} className="text-sm">
              <span className="text-slate-300">{b}</span>
              <span className="ml-1 font-medium text-white">{c}</span>
            </span>
          ))}
          <span className="text-sm font-medium text-sky-400">Total: {totalLeads}</span>
        </div>
      )}
      <div className="card flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Stage (multi)</label>
          <div className="flex flex-wrap gap-1">
            {["UNTOUCHED", "CONTACTED", "FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID", "PAID", "DENIED"].map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`badge ${statuses.includes(s) ? "bg-sky-600 text-white" : "bg-slate-600 text-slate-300"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">BDM</label>
          <select
            value={bdm}
            onChange={(e) => setBdm(e.target.value)}
            className="input w-40"
          >
            <option value="">All</option>
            {(dropdowns?.bdms ?? []).map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-48"
            placeholder="Name, city, phone..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Period</label>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="input w-40"
          >
            <option value="">All</option>
            <option value="mtd">Month to date</option>
            <option value="pm">Previous month</option>
            <option value="wtd">Week to date</option>
            <option value="pw">Previous week</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Custom from</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-36 text-sm py-1.5" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Custom to</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-36 text-sm py-1.5" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">View</label>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as "active" | "inactive" | "all")}
            className="input w-36 text-sm py-1.5"
          >
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Lead type</label>
          <select value={leadType} onChange={(e) => setLeadType(e.target.value)} className="input w-40 text-sm py-1.5">
            <option value="">All</option>
            <option value="new">New lead</option>
            <option value="on_plan">On plan</option>
            <option value="existing_customer">Existing customer</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Renewal</label>
          <select value={renewalStage} onChange={(e) => setRenewalStage(e.target.value)} className="input w-36 text-sm py-1.5">
            <option value="">All</option>
            <option value="none">No renewal</option>
            <option value="follow_up">Renewal follow-up</option>
            <option value="rejected">Renewal rejected</option>
            <option value="pending">Renewal pending</option>
            <option value="paid">Renewal paid</option>
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-4 bg-sky-900/20 border-sky-600/50">
          <span className="text-sm text-white font-medium">{selected.size} selected</span>
          <button
            onClick={() => setBulkAction("inactive")}
            className="btn-secondary text-sm py-1.5"
          >
            Mark Inactive
          </button>
          <button
            onClick={() => setBulkAction("active")}
            className="btn-secondary text-sm py-1.5"
          >
            Mark Active
          </button>
          <button
            onClick={() => setBulkAction("reassign")}
            className="btn-secondary text-sm py-1.5"
          >
            Reassign to BDM
          </button>
          <button onClick={() => { setSelected(new Set()); setBulkAction(null); setReassignBdm(""); }} className="text-slate-400 hover:text-white text-sm">
            Clear
          </button>
          {bulkAction === "reassign" && (
            <div className="flex items-center gap-2">
              <select
                value={reassignBdm}
                onChange={(e) => setReassignBdm(e.target.value)}
                className="input text-sm py-1.5 w-36"
              >
                <option value="">Select BDM</option>
                {(dropdowns?.bdms ?? []).map((b: string) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <button onClick={runBulkAction} disabled={!reassignBdm || bulkLoading} className="btn-primary text-sm py-1.5">
                {bulkLoading ? "..." : "Apply"}
              </button>
            </div>
          )}
          {(bulkAction === "inactive" || bulkAction === "active") && (
            <button onClick={runBulkAction} disabled={bulkLoading} className="btn-primary text-sm py-1.5">
              {bulkLoading ? "..." : bulkAction === "active" ? "Confirm Active" : "Confirm Inactive"}
            </button>
          )}
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
              <tr className="border-b border-slate-600 text-left text-sm text-slate-400">
              <th className="p-2 w-10">
                <input type="checkbox" checked={selected.size === (leads as Lead[]).length && (leads as Lead[]).length > 0} onChange={toggleSelectAll} className="rounded" />
              </th>
              <th className="p-2">Type</th>
              <th className="p-2">Name</th>
              <th className="p-2">Company</th>
              <th className="p-2">City</th>
              <th className="p-2">BDM</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Status</th>
              <th className="p-2">Next Follow Up</th>
              <th className="p-2">Last Modified</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {(leads as Lead[]).map((l) => (
              <tr key={l.id} className="border-b border-slate-700/50">
                <td className="p-2">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} className="rounded" />
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {l.leadType === "on_plan" && (
                      <span className="badge bg-emerald-600/80 text-xs" title={l.planExpiry ? `Expires ${l.planExpiry}` : ""}>
                        On plan{l.activePlanName ? ` · ${l.activePlanName}` : ""}{l.planExpiry ? ` · ${l.planExpiry}` : ""}
                        {l.activeOpsCoordinator && <span className="text-slate-300"> · Ops: {l.activeOpsCoordinator}</span>}
                      </span>
                    )}
                    {l.leadType === "existing_customer" && (
                      <span className="badge bg-slate-500 text-xs">Existing</span>
                    )}
                    {l.renewalStage === "follow_up" && (
                      <span className="badge bg-slate-500 text-xs">Renewal follow-up</span>
                    )}
                    {l.renewalStage === "rejected" && (
                      <span className="badge bg-red-600/80 text-xs">Renewal rejected</span>
                    )}
                    {l.renewalStage === "pending" && (
                      <span className="badge bg-amber-600/80 text-xs">Renewal</span>
                    )}
                  </div>
                </td>
                <td className="p-2 font-medium">{l.name}</td>
                <td className="p-2 text-slate-300">{l.company || "-"}</td>
                <td className="p-2 text-slate-300">{l.city}</td>
                <td className="p-2 text-slate-300">{l.bdm}</td>
                <td className="p-2 text-slate-300">{l.plan}</td>
                <td className="p-2">
                  <span className="badge bg-slate-600">{l.status}</span>
                </td>
                <td className="p-2 text-slate-300 text-sm">{l.next_follow_up || "-"}</td>
                <td className="p-2 text-slate-400 text-sm">
                  {l.last_modified ? new Date(l.last_modified).toLocaleString("en-IN") : "-"}
                </td>
                <td className="p-2">
                  <Link href={`/leads/${l.id}`} className="text-sky-400 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
