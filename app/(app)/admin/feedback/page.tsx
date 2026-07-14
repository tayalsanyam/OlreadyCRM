"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";

type FeedbackRow = {
  id: string;
  displayId?: string;
  brideName?: string;
  muaType?: string;
  connectionStatus?: string;
  serviceSentiment?: string | null;
  olreadyRating?: number | null;
  muaRating?: number | null;
  olreadyServiceNote?: string | null;
  muaServiceNote?: string | null;
  recommendationsNote?: string | null;
  referralsNote?: string | null;
  referencesNote?: string | null;
  improvementsNote?: string | null;
  createdAt?: string;
  display_id?: string;
  bride_name?: string;
  mua_type?: string;
  connection_status?: string;
  service_sentiment?: string | null;
  olready_rating?: number | null;
  mua_rating?: number | null;
  olready_service_note?: string | null;
  mua_service_note?: string | null;
  recommendations_note?: string | null;
  referrals_note?: string | null;
  references_note?: string | null;
  improvements_note?: string | null;
  created_at?: string;
};

function rowLeadId(r: FeedbackRow) {
  return r.displayId ?? r.display_id ?? "—";
}
function rowBride(r: FeedbackRow) {
  return r.brideName ?? r.bride_name ?? "—";
}
function rowMuaType(r: FeedbackRow) {
  return r.muaType ?? r.mua_type ?? "—";
}
function rowSentiment(r: FeedbackRow) {
  return r.serviceSentiment ?? r.service_sentiment ?? "—";
}
function rowOlreadyRating(r: FeedbackRow) {
  return r.olreadyRating ?? r.olready_rating ?? "—";
}
function rowMuaRating(r: FeedbackRow) {
  return r.muaRating ?? r.mua_rating ?? "—";
}
function rowStatus(r: FeedbackRow) {
  return r.connectionStatus ?? r.connection_status ?? "—";
}
function rowDate(r: FeedbackRow) {
  const d = r.createdAt ?? r.created_at;
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}
function rowOlreadyServiceNote(r: FeedbackRow) {
  return r.olreadyServiceNote ?? r.olready_service_note ?? "—";
}
function rowMuaServiceNote(r: FeedbackRow) {
  return r.muaServiceNote ?? r.mua_service_note ?? "—";
}
function rowRecommendations(r: FeedbackRow) {
  return r.recommendationsNote ?? r.recommendations_note ?? "—";
}
function rowReferrals(r: FeedbackRow) {
  return r.referralsNote ?? r.referrals_note ?? "—";
}
function rowReferences(r: FeedbackRow) {
  return r.referencesNote ?? r.references_note ?? "—";
}
function rowImprovements(r: FeedbackRow) {
  return r.improvementsNote ?? r.improvements_note ?? "—";
}

export default function AdminFeedbackPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [muaType, setMuaType] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [serviceSentiment, setServiceSentiment] = useState("");
  const [fromDate, setFromDate] = useState(() => searchParams.get("fromDate") ?? "");
  const [toDate, setToDate] = useState(() => searchParams.get("toDate") ?? "");

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (muaType) params.set("muaType", muaType);
    if (connectionStatus) params.set("connectionStatus", connectionStatus);
    if (serviceSentiment) params.set("serviceSentiment", serviceSentiment);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    setLoading(true);
    fetch(`/api/admin/feedback?${params.toString()}`)
      .then((r) => r.json())
      .then((j: { data: FeedbackRow[] }) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, [q, muaType, connectionStatus, serviceSentiment, fromDate, toDate]);

  const exportPath = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (muaType) params.set("muaType", muaType);
    if (connectionStatus) params.set("connectionStatus", connectionStatus);
    if (serviceSentiment) params.set("serviceSentiment", serviceSentiment);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    const qs = params.toString();
    return qs ? `/api/admin/feedback?${qs}` : "/api/admin/feedback";
  }, [q, muaType, connectionStatus, serviceSentiment, fromDate, toDate]);

  return (
    <div className="mx-auto max-w-[92rem] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">Lead Feedback</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/feedback/reports">
            <Button variant="secondary" size="sm">
              Full reports
            </Button>
          </Link>
          <AdminExportCsvButton apiPath={exportPath} />
        </div>
      </div>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-6">
        <Input
          label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lead ID, bride, MUA name"
          className="lg:col-span-2"
        />
        <Select
          label="MUA type"
          value={muaType}
          onChange={(e) => setMuaType(e.target.value)}
          options={[
            { value: "", label: "All" },
            { value: "olready", label: "Olready" },
            { value: "non_olready", label: "Non-Olready" },
          ]}
        />
        <Select
          label="Connection"
          value={connectionStatus}
          onChange={(e) => setConnectionStatus(e.target.value)}
          options={[
            { value: "", label: "All" },
            { value: "connected", label: "Connected" },
            { value: "not_answered", label: "Not answered" },
            { value: "not_interested", label: "Declined" },
            { value: "closed_no_contact", label: "Closed no contact" },
          ]}
        />
        <Select
          label="Sentiment"
          value={serviceSentiment}
          onChange={(e) => setServiceSentiment(e.target.value)}
          options={[
            { value: "", label: "All" },
            { value: "positive", label: "Positive" },
            { value: "mixed", label: "Mixed" },
            { value: "negative", label: "Negative" },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <Input
            label="From"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Bride</TH>
              <TH>MUA type</TH>
              <TH>Sentiment</TH>
              <TH>Olready ★</TH>
              <TH>MUA ★</TH>
              <TH>Olready service note</TH>
              <TH>MUA service note</TH>
              <TH>Recommendations</TH>
              <TH>Referrals note</TH>
              <TH>References note</TH>
              <TH>Improvements note</TH>
              <TH>Status</TH>
              <TH>Date</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>{rowLeadId(r)}</TD>
                <TD>{rowBride(r)}</TD>
                <TD>{rowMuaType(r)}</TD>
                <TD>{rowSentiment(r)}</TD>
                <TD>{rowOlreadyRating(r)}</TD>
                <TD>{rowMuaRating(r)}</TD>
                <TD className="max-w-72 whitespace-pre-wrap text-sm">{rowOlreadyServiceNote(r)}</TD>
                <TD className="max-w-72 whitespace-pre-wrap text-sm">{rowMuaServiceNote(r)}</TD>
                <TD className="max-w-72 whitespace-pre-wrap text-sm">{rowRecommendations(r)}</TD>
                <TD className="max-w-72 whitespace-pre-wrap text-sm">{rowReferrals(r)}</TD>
                <TD className="max-w-72 whitespace-pre-wrap text-sm">{rowReferences(r)}</TD>
                <TD className="max-w-72 whitespace-pre-wrap text-sm">{rowImprovements(r)}</TD>
                <TD>
                  <Badge>{rowStatus(r)}</Badge>
                </TD>
                <TD>{rowDate(r)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
