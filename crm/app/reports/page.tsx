"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bdm, setBdm] = useState("");
  const [plan, setPlan] = useState("");
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (bdm) params.set("bdm", bdm);
  if (plan) params.set("plan", plan);
  const url = `/api/reports?${params}`;
  const { data, error } = useSWR(url, fetcher);
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  if (error) return <div className="text-red-400">Failed to load</div>;
  if (!data) return <div className="text-slate-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="mb-1 block text-xs text-slate-400">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input text-sm py-1.5 w-36" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input text-sm py-1.5 w-36" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">BDM</label>
            <select value={bdm} onChange={(e) => setBdm(e.target.value)} className="input text-sm py-1.5 w-32">
              <option value="">All</option>
              {(dropdowns?.bdms ?? []).map((b: string) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input text-sm py-1.5 w-32">
              <option value="">All</option>
              {(dropdowns?.plans ?? []).map((p: { name?: string; plan?: string }) => {
                const n = p.name ?? p.plan ?? String(p);
                return <option key={n} value={n}>{n}</option>;
              })}
            </select>
          </div>
        </div>
      </div>
      {(!dateFrom && !dateTo) && (
        <p className="text-sm text-slate-500">No date range set — showing all-time totals</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card">
          <p className="text-sm text-slate-400">Total Leads</p>
          <p className="text-2xl font-bold text-white">{data.totalLeads}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-400">Received (this period)</p>
          <p className="text-2xl font-bold text-emerald-400">₹{data.revenue?.toLocaleString() ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-400">Pending (this period)</p>
          <p className="text-2xl font-bold text-amber-400">₹{data.pending?.toLocaleString() ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-400">Pending (from previous)</p>
          <p className="text-2xl font-bold text-amber-300">₹{data.pendingFromPrevious?.toLocaleString() ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Not part of target</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-400">Conversion %</p>
          <p className="text-2xl font-bold text-sky-400">{data.conversion}%</p>
        </div>
      </div>
      <div className="card">
        <h2 className="mb-4 font-semibold text-white">BDM Performance</h2>
        <p className="mb-3 text-xs text-slate-500">Target % is only on received. Pending from previous is not part of target.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-600 text-left text-sm text-slate-400">
                <th className="p-2">BDM</th>
                <th className="p-2">Leads</th>
                <th className="p-2">Untouched</th>
                <th className="p-2">Contacted</th>
                <th className="p-2">Followed up</th>
                <th className="p-2">Denied</th>
                <th className="p-2">Confirmed</th>
                <th className="p-2">Partly Paid</th>
                <th className="p-2">Paid</th>
                <th className="p-2">Target</th>
                <th className="p-2">Expected</th>
                <th className="p-2">Received</th>
                <th className="p-2">Pending</th>
                <th className="p-2">Prev. Pending</th>
                <th className="p-2">%</th>
              </tr>
            </thead>
            <tbody>
              {(data.bdmPerformance ?? []).map((row: {
                bdm: string; leads: number; untouched: number; contacted: number; followedUp: number;
                denied: number; confirmed: number; partlyPaid?: number; paid: number;
                target: number; expected: number; received: number; pending: number; pendingFromPrevious: number;
                achieved: number; percent: number;
              }) => (
                <tr key={row.bdm} className="border-b border-slate-700/50">
                  <td className="p-2 font-medium">{row.bdm}</td>
                  <td className="p-2 text-slate-300">{row.leads ?? 0}</td>
                  <td className="p-2 text-slate-300">{row.untouched ?? 0}</td>
                  <td className="p-2 text-slate-300">{row.contacted ?? 0}</td>
                  <td className="p-2 text-slate-300">{row.followedUp ?? 0}</td>
                  <td className="p-2 text-slate-300">{row.denied ?? 0}</td>
                  <td className="p-2 text-slate-300">{row.confirmed ?? 0}</td>
                  <td className="p-2 text-slate-300">{row.partlyPaid ?? 0}</td>
                  <td className="p-2 text-slate-300">{row.paid ?? 0}</td>
                  <td className="p-2 text-slate-300">₹{row.target?.toLocaleString() ?? 0}</td>
                  <td className="p-2 text-slate-300">₹{row.expected?.toLocaleString() ?? 0}</td>
                  <td className="p-2 text-emerald-400">₹{row.received?.toLocaleString() ?? 0}</td>
                  <td className="p-2 text-amber-400">₹{row.pending?.toLocaleString() ?? 0}</td>
                  <td className="p-2 text-amber-300">₹{row.pendingFromPrevious?.toLocaleString() ?? 0}</td>
                  <td className="p-2">{row.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Link href="/api/leads/export" className="btn-primary" target="_blank">
        Export CSV (Admin)
      </Link>
    </div>
  );
}
