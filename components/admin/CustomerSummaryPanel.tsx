"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { rowsToCsv } from "@/lib/csv";

interface SummaryRow {
  rmId: string;
  rmName: string;
  region: string;
  totalLeads: number;
  notContacted: number;
  contacted: number;
  pendingConfirmation: number;
  awaitingProfiles: number;
  avgMuasOffered: number | null;
  belowAverage: number;
  booked: number;
  shifted: number;
}

interface LeadDetail {
  leadId: string;
  displayId: string;
  brideName: string;
  budgetTier: string;
  status: string;
  eventDate: string;
  urgencyBand: string;
  muasOffered: number;
  muaDetails: Array<{
    muaName: string;
    stage: string;
    status: string;
    lastActivity: string;
  }>;
}

const STAGE_COLOR: Record<string, string> = {
  initial_contact: "bg-blue-100 text-blue-800",
  offer_sent: "bg-blue-100 text-blue-800",
  follow_up_done: "bg-teal-100 text-teal-800",
  negotiating: "bg-amber-100 text-amber-800",
  bride_selected: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-100 text-slate-600",
};

export function CustomerSummaryPanel() {
  const [region, setRegion] = useState("");
  const [rmId, setRmId] = useState("");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [leads, setLeads] = useState<LeadDetail[]>([]);
  const [expandedRm, setExpandedRm] = useState<string | null>(null);

  function load(rm?: string) {
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (rm) params.set("rmId", rm);
    void fetch(`/api/admin/reports/rm-summary?${params}`)
      .then((r) => r.json())
      .then(
        (json: {
          data: { summary: SummaryRow[]; leads: LeadDetail[] };
        }) => {
          const leadRows = (json.data?.leads ?? []).map((l) => ({
            ...l,
            muaDetails: Array.isArray(l.muaDetails)
              ? l.muaDetails
              : typeof l.muaDetails === "string"
                ? (JSON.parse(l.muaDetails) as LeadDetail["muaDetails"])
                : [],
          }));
          setSummary(json.data?.summary ?? []);
          setLeads(leadRows);
        }
      );
  }

  useEffect(() => {
    load();
  }, [region]);

  const rms = useMemo(() => summary.map((s) => ({ id: s.rmId, name: s.rmName })), [summary]);

  function notContactedClass(row: SummaryRow) {
    if (row.totalLeads === 0) return "";
    const pct = (row.notContacted / row.totalLeads) * 100;
    if (pct > 20) return "bg-red-100 text-red-800";
    if (pct >= 10) return "bg-amber-100 text-amber-800";
    return "bg-emerald-100 text-emerald-800";
  }

  function avgClass(avg: number | null) {
    if (avg === null) return "";
    if (avg >= 3) return "text-emerald-600 font-semibold";
    if (avg >= 1) return "text-amber-600 font-semibold";
    return "text-red-600 font-semibold";
  }

  function exportCsv() {
    const headers = [
      "RM Name",
      "Region",
      "Total Leads",
      "Not Contacted",
      "Avg MUAs Offered",
      "Below Average",
      "Booked",
      "Shifted",
    ];
    const rows = summary.map((r) => [
      r.rmName,
      r.region,
      r.totalLeads,
      r.notContacted,
      r.avgMuasOffered,
      r.belowAverage,
      r.booked,
      r.shifted,
    ]);
    const blob = new Blob([rowsToCsv(headers, rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rm-customer-summary.csv";
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Region
          <select
            className="ml-2 rounded border px-2 py-1"
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setRmId("");
              setExpandedRm(null);
            }}
          >
            <option value="">All</option>
            {["north", "east", "west", "south"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          RM
          <select
            className="ml-2 rounded border px-2 py-1"
            value={rmId}
            onChange={(e) => {
              setRmId(e.target.value);
              setExpandedRm(e.target.value || null);
              load(e.target.value || undefined);
            }}
          >
            <option value="">All</option>
            {rms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <THead>
            <TR>
              <TH>RM</TH>
              <TH>Region</TH>
              <TH>Total</TH>
              <TH>Not contacted</TH>
              <TH>Pending confirm</TH>
              <TH>Awaiting profiles</TH>
              <TH>Avg MUAs</TH>
              <TH>Below avg</TH>
              <TH>Booked</TH>
              <TH>Shifted</TH>
            </TR>
          </THead>
          <TBody>
            {summary.map((r) => (
              <TR key={r.rmId} className="hover:bg-light-bg">
                <TD className="font-medium">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => {
                      const next = expandedRm === r.rmId ? null : r.rmId;
                      setExpandedRm(next);
                      if (next) load(r.rmId);
                    }}
                  >
                    {r.rmName}
                  </button>
                </TD>
                <TD className="capitalize">{r.region}</TD>
                <TD>{r.totalLeads}</TD>
                <TD>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      notContactedClass(r)
                    )}
                  >
                    {r.notContacted}
                  </span>
                </TD>
                <TD>{r.pendingConfirmation ?? 0}</TD>
                <TD>{r.awaitingProfiles ?? 0}</TD>
                <TD className={avgClass(r.avgMuasOffered)}>
                  {r.avgMuasOffered ?? "—"}
                </TD>
                <TD>{r.belowAverage}</TD>
                <TD>{r.booked}</TD>
                <TD>{r.shifted}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {expandedRm && leads.length > 0 && (
        <div className="space-y-2">
          {leads.map((l) => (
            <Card key={l.leadId} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-brand">{l.brideName}</span>
                <span className="text-xs text-slate-muted">{l.displayId}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                  {l.muasOffered} MUAs offered
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(l.muaDetails ?? []).map((m, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-medium",
                      STAGE_COLOR[m.stage] ?? "bg-slate-100"
                    )}
                  >
                    {m.muaName}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
