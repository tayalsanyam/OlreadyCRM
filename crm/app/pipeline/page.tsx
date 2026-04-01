"use client";

import { useState, type MouseEvent } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";

const STAGES = ["UNTOUCHED", "CONTACTED", "FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID", "PAID", "DENIED"];

export default function PipelinePage() {
  const [bdm, setBdm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (bdm) params.set("bdm", bdm);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const url = `/api/leads${params.toString() ? `?${params}` : ""}`;
  const { data: leads = [], error, mutate } = useSWR(url, fetcher, { refreshInterval: 5000 });
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);

  if (error) return <div className="text-red-400">Failed to load</div>;

  const byStage: Record<string, typeof leads> = {};
  for (const s of STAGES) byStage[s] = [];
  leads.forEach((l: { status: string; id: string; name: string; bdm: string; plan: string }) => {
    const key = l.status || "UNTOUCHED";
    if (!byStage[key]) byStage[key] = [];
    byStage[key].push(l);
  });
  const bdms = dropdowns?.bdms ?? [];

  async function handleDrop(leadId: string, newStatus: string) {
    if (!leadId || !newStatus) return;
    setDragging(null);
    setDragOver(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) mutate();
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Pipeline</h1>
        <div className="flex flex-wrap gap-2">
          <select
            value={bdm}
            onChange={(e) => setBdm(e.target.value)}
            className="input text-sm py-1.5 w-32"
          >
            <option value="">All BDMs</option>
            {bdms.map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input text-sm py-1.5 w-36"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input text-sm py-1.5 w-36"
            placeholder="To"
          />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div
            key={stage}
            className={`flex-shrink-0 w-72 rounded-xl border border-slate-700 bg-slate-800/80 transition-colors ${
              dragOver === stage ? "ring-2 ring-sky-500" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(stage);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const leadId = e.dataTransfer.getData("leadId");
              if (leadId) handleDrop(leadId, stage);
            }}
          >
            <div className="border-b border-slate-600 px-4 py-2 font-semibold text-white">
              {stage} ({byStage[stage]?.length ?? 0})
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-2 space-y-2">
              {(byStage[stage] ?? []).map((l: { id: string; name: string; bdm: string; plan: string }) => (
                <div
                  key={l.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("leadId", l.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(l.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={`cursor-grab active:cursor-grabbing rounded-lg border border-slate-600 bg-slate-700/50 p-3 hover:bg-slate-600/50 ${
                    dragging === l.id ? "opacity-50" : ""
                  }`}
                >
                  <Link
                    href={`/leads/${l.id}`}
                    className="block"
                    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                      if (dragging) e.preventDefault();
                    }}
                  >
                    <p className="font-medium text-white">{l.name}</p>
                    <p className="text-xs text-slate-400">{l.bdm} · {l.plan}</p>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
