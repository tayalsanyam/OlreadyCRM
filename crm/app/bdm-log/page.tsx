"use client";

import { useState } from "react";
import useSWR from "swr";

import { fetcher } from "@/lib/fetcher";

export default function BDMLogPage() {
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const [bdm, setBdm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const params = new URLSearchParams();
  if (bdm) params.set("bdm", bdm);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const { data: logs = [] } = useSWR(`/api/bdm-log?${params}`, fetcher, { refreshInterval: 5000 });
  const [form, setForm] = useState({
    bdm: "", date: new Date().toISOString().slice(0, 10),
    total_calls: 0, connected_calls: 0, non_answered_calls: 0, talk_time: 0,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/bdm-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm((f) => ({ ...f, total_calls: 0, connected_calls: 0, non_answered_calls: 0, talk_time: 0 }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">BDM Call Log</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">Add Entry</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-slate-400">BDM</label>
              <select
                value={form.bdm}
                onChange={(e) => setForm((f) => ({ ...f, bdm: e.target.value }))}
                className="input"
                required
              >
                <option value="">Select</option>
                {(dropdowns?.bdms ?? []).map((b: string) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Total Calls</label>
                <input
                  type="number"
                  value={form.total_calls || ""}
                  onChange={(e) => setForm((f) => ({ ...f, total_calls: Number(e.target.value) }))}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Connected</label>
                <input
                  type="number"
                  value={form.connected_calls || ""}
                  onChange={(e) => setForm((f) => ({ ...f, connected_calls: Number(e.target.value) }))}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Non-answered</label>
                <input
                  type="number"
                  value={form.non_answered_calls || ""}
                  onChange={(e) => setForm((f) => ({ ...f, non_answered_calls: Number(e.target.value) }))}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Talk time (min)</label>
                <input
                  type="number"
                  value={form.talk_time || ""}
                  onChange={(e) => setForm((f) => ({ ...f, talk_time: Number(e.target.value) }))}
                  className="input"
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Add"}
            </button>
          </form>
        </div>
        <div className="card">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <h2 className="font-semibold text-white">Log</h2>
            <div>
              <label className="mb-1 block text-xs text-slate-400">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input text-sm py-1.5 w-36" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input text-sm py-1.5 w-36" />
            </div>
            <select
              value={bdm}
              onChange={(e) => setBdm(e.target.value)}
              className="input w-40"
            >
              <option value="">All BDMs</option>
              {(dropdowns?.bdms ?? []).map((b: string) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {logs.map((l: { id: string; bdm: string; date: string; total_calls: number; connected_calls: number; non_answered_calls: number; talk_time: number }) => (
              <div key={l.id} className="rounded bg-slate-700/50 p-2 text-sm">
                <span className="font-medium">{l.bdm}</span> · {l.date}
                <p className="text-slate-400">
                  Total: {l.total_calls} · Connected: {l.connected_calls} · Talk: {l.talk_time}min
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
