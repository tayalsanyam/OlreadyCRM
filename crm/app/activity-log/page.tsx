"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";

import { fetcher } from "@/lib/fetcher";

export default function ActivityLogPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bdm, setBdm] = useState("");
  const [type, setType] = useState("");
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (bdm) params.set("bdm", bdm);
  if (type) params.set("type", type);
  const url = `/api/activity/log?${params}`;
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const { data: logs = [], error } = useSWR(url, fetcher, { refreshInterval: 5000 });
  if (error) return <div className="text-red-400">Failed to load</div>;

  const exportParams = new URLSearchParams();
  if (dateFrom) exportParams.set("dateFrom", dateFrom);
  if (dateTo) exportParams.set("dateTo", dateTo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Activity Log</h1>
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
            <label className="mb-1 block text-xs text-slate-400">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input text-sm py-1.5 w-36">
              <option value="">All</option>
              <option value="Call">Call</option>
              <option value="Note">Note</option>
              <option value="Status change">Status change</option>
              <option value="Payment">Payment</option>
            </select>
          </div>
          <Link href={`/api/activity/export?${exportParams}`} className="btn-secondary" target="_blank">Download CSV (Admin)</Link>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-600 text-left text-sm text-slate-400">
              <th className="p-2">Date</th>
              <th className="p-2">Time</th>
              <th className="p-2">Action</th>
              <th className="p-2">User</th>
              <th className="p-2">Notes</th>
              <th className="p-2">Lead</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l: { id: string; date: string; time?: string; action: string; user?: string; notes?: string; lead_id: string }) => (
              <tr key={l.id} className="border-b border-slate-700/50">
                <td className="p-2 text-slate-300">{l.date}</td>
                <td className="p-2 text-slate-400">{l.time}</td>
                <td className="p-2">{l.action}</td>
                <td className="p-2 text-slate-300">{l.user}</td>
                <td className="p-2 text-slate-400 max-w-xs truncate">{l.notes}</td>
                <td className="p-2">
                  <Link href={`/leads/${l.lead_id}`} className="text-sky-400 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
