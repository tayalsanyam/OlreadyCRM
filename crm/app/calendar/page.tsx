"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";

import { fetcher } from "@/lib/fetcher";

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date());
  const from = format(startOfMonth(month), "yyyy-MM-dd");
  const to = format(endOfMonth(month), "yyyy-MM-dd");
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const [bdm, setBdm] = useState("");
  const [status, setStatus] = useState("");
  const params = new URLSearchParams({ from, to });
  if (bdm) params.set("bdm", bdm);
  if (status) params.set("status", status);
  const url = `/api/calendar/events?${params}`;
  const { data: filtered = [] } = useSWR(url, fetcher, { refreshInterval: 10000 });

  const byDate: Record<string, typeof filtered> = {};
  filtered.forEach((e: { date: string }) => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });

  const days = (() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const arr = [];
    let d = new Date(start);
    while (d <= end) {
      arr.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return arr;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Calendar</h1>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-40">
            <option value="">All stages</option>
            {["UNTOUCHED", "CONTACTED", "FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID", "PAID", "DENIED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={bdm} onChange={(e) => setBdm(e.target.value)} className="input w-40">
            <option value="">All BDMs</option>
            {(dropdowns?.bdms ?? []).map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button
            onClick={() => setMonth(subMonths(month, 1))}
            className="btn-secondary"
          >
            ←
          </button>
          <span className="font-medium text-white w-40 text-center">
            {format(month, "MMMM yyyy")}
          </span>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            className="btn-secondary"
          >
            →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-sm font-medium text-slate-400">{d}</div>
        ))}
        {Array.from({ length: startOfMonth(month).getDay() }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className="min-h-24 rounded-lg border border-slate-700 bg-slate-800/50 p-2"
          >
            <p className="text-sm font-medium text-slate-300">{format(d, "d")}</p>
            <div className="mt-1 space-y-1">
              {(byDate[format(d, "yyyy-MM-dd")] ?? []).map((e: { id: string; title: string; type: string; lead_id?: string }) => (
                <Link
                  key={e.id}
                  href={e.lead_id ? `/leads/${e.lead_id}` : "#"}
                  className="block truncate rounded text-xs text-sky-400 hover:underline"
                >
                  {e.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
