"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  PendingEmailPreviewModal,
  type PendingEmailPreviewData,
} from "@/components/grievances/PendingEmailPreviewModal";
import type { PendingEmailApprovalRow } from "@/lib/pending-email-approvals-types";
import {
  isPendingEmailDueSoon,
  pendingEmailPartyLabel,
  pendingEmailUrgencyRank,
} from "@/lib/pending-email-approvals-types";
import { TICKET_CATEGORY_LABELS } from "@/lib/ticket-categories";
import { raisedByTypeLabel } from "@/lib/ticket-display";
import { cn, formatDate } from "@/lib/utils";

type SortKey = "sla" | "urgency" | "submitted";

type SlaFilter = "" | "breached" | "due_soon";

function toPreview(row: PendingEmailApprovalRow): PendingEmailPreviewData {
  return {
    emailId: row.emailId,
    ticketId: row.ticketId,
    ticketNumber: row.ticketNumber,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    toEmail: row.toEmail,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
    muaName: row.muaName,
    brideName: row.brideName,
    raisedByName: row.raisedByName,
    raisedByType: row.raisedByType,
    ticketStatus: row.ticketStatus,
    category: row.category,
    complaintText: row.complaintText,
    attachmentCount: row.attachmentIds?.length ?? 0,
  };
}

function matchesSearch(row: PendingEmailApprovalRow, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const haystack = [
    row.ticketNumber,
    row.subject,
    row.toEmail,
    row.muaName,
    row.brideName,
    row.raisedByName,
    row.complaintText,
    TICKET_CATEGORY_LABELS[row.category],
    row.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function sortRows(rows: PendingEmailApprovalRow[], sort: SortKey): PendingEmailApprovalRow[] {
  const copy = [...rows];
  if (sort === "urgency") {
    copy.sort((a, b) => {
      const u = pendingEmailUrgencyRank(a.urgency) - pendingEmailUrgencyRank(b.urgency);
      if (u !== 0) return u;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    return copy;
  }
  if (sort === "submitted") {
    copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return copy;
  }
  copy.sort((a, b) => {
    if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1;
    const aDue = a.slaDueAt ? new Date(a.slaDueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.slaDueAt ? new Date(b.slaDueAt).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    const u = pendingEmailUrgencyRank(a.urgency) - pendingEmailUrgencyRank(b.urgency);
    if (u !== 0) return u;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return copy;
}

function buildCategoryOptions(rows: PendingEmailApprovalRow[]) {
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  return [
    { value: "", label: "All categories" },
    ...categories.map((value) => ({
      value,
      label: TICKET_CATEGORY_LABELS[value] ?? value,
    })),
  ];
}

export function PendingEmailApprovalsClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingEmailApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PendingEmailPreviewData | null>(null);
  const [q, setQ] = useState("");
  const [urgency, setUrgency] = useState("");
  const [raisedByType, setRaisedByType] = useState("");
  const [category, setCategory] = useState("");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("");
  const [sort, setSort] = useState<SortKey>("sla");

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/admin/grievances/email-approvals")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          toast(json.error, "error");
          return;
        }
        setRows(json.data ?? []);
      })
      .catch(() => toast("Could not load pending emails", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const breached = rows.filter((r) => r.slaBreached).length;
    const high = rows.filter((r) => r.urgency === "high").length;
    const dueSoon = rows.filter((r) => isPendingEmailDueSoon(r.slaDueAt, r.slaBreached)).length;
    const brides = rows.filter((r) => r.raisedByType === "bride").length;
    const muas = rows.filter((r) => r.raisedByType === "mua").length;
    return { total: rows.length, breached, high, dueSoon, brides, muas };
  }, [rows]);

  const categoryOptions = useMemo(() => buildCategoryOptions(rows), [rows]);

  const filtered = useMemo(() => {
    let list = rows.filter((row) => {
      if (urgency && row.urgency !== urgency) return false;
      if (raisedByType && row.raisedByType !== raisedByType) return false;
      if (category && row.category !== category) return false;
      if (slaFilter === "breached" && !row.slaBreached) return false;
      if (slaFilter === "due_soon" && !isPendingEmailDueSoon(row.slaDueAt, row.slaBreached)) {
        return false;
      }
      return matchesSearch(row, q);
    });
    return sortRows(list, sort);
  }, [rows, urgency, raisedByType, category, slaFilter, q, sort]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Pending email approvals</h1>
          <p className="text-sm text-slate-muted">
            Review care email drafts across all tickets. Prioritise by SLA and urgency, then
            approve or edit before care sends.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">Pending</p>
          <p className="mt-1 text-3xl font-bold text-brand">{summary.total}</p>
          <p className="mt-1 text-xs text-slate-muted">
            {filtered.length !== summary.total
              ? `${filtered.length} shown with filters`
              : "awaiting admin review"}
          </p>
        </Card>
        <Card className={cn("p-4", summary.breached > 0 && "border-red-200 bg-red-50/40")}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">SLA breached</p>
          <p
            className={cn(
              "mt-1 text-3xl font-bold",
              summary.breached > 0 ? "text-red-600" : "text-brand",
            )}
          >
            {summary.breached}
          </p>
          <p className="mt-1 text-xs text-slate-muted">send these first</p>
        </Card>
        <Card className={cn("p-4", summary.dueSoon > 0 && "border-amber-200 bg-amber-50/40")}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">Due ≤ 24h</p>
          <p
            className={cn(
              "mt-1 text-3xl font-bold",
              summary.dueSoon > 0 ? "text-amber-800" : "text-brand",
            )}
          >
            {summary.dueSoon}
          </p>
          <p className="mt-1 text-xs text-slate-muted">includes breached</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">High urgency</p>
          <p className="mt-1 text-3xl font-bold text-brand">{summary.high}</p>
          <p className="mt-1 text-xs text-slate-muted">tickets marked high</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">By type</p>
          <p className="mt-1 text-lg font-semibold text-brand">
            {summary.brides} bride · {summary.muas} MUA
          </p>
          <p className="mt-1 text-xs text-slate-muted">of pending queue</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2">
        {(
          [
            ["", "All types"],
            ["breached", "SLA breached"],
            ["due_soon", "Due within 24h"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value || "all-sla"}
            type="button"
            onClick={() => setSlaFilter(value as SlaFilter)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              slaFilter === value
                ? "bg-brand text-white"
                : "text-slate-muted hover:bg-slate-100",
            )}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-slate-200" aria-hidden />
        {(
          [
            ["", "All"],
            ["bride", "Bride"],
            ["mua", "MUA"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value || "all-type"}
            type="button"
            onClick={() => setRaisedByType(value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              raisedByType === value
                ? "bg-brand text-white"
                : "text-slate-muted hover:bg-slate-100",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search ticket, party, subject…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value)}
          options={[
            { value: "", label: "All urgency" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={categoryOptions}
        />
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          options={[
            { value: "sla", label: "Sort: SLA deadline first" },
            { value: "urgency", label: "Sort: Urgency" },
            { value: "submitted", label: "Sort: Oldest submitted" },
          ]}
        />
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-muted">
            {rows.length === 0
              ? "No emails waiting for admin review."
              : "No pending emails match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Ticket</TH>
                  <TH>Type</TH>
                  <TH>Category</TH>
                  <TH>Party</TH>
                  <TH>Urgency</TH>
                  <TH>SLA deadline</TH>
                  <TH>Subject</TH>
                  <TH>Submitted</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((row) => (
                  <TR
                    key={row.emailId}
                    className={cn(row.slaBreached && "bg-red-50/50")}
                  >
                    <TD>
                      <Link
                        href={`/care/grievances/${row.ticketId}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {row.ticketNumber}
                      </Link>
                    </TD>
                    <TD>
                      <Badge variant="muted">{raisedByTypeLabel(row.raisedByType)}</Badge>
                    </TD>
                    <TD className="max-w-[10rem] text-xs text-slate-muted">
                      {TICKET_CATEGORY_LABELS[row.category] ?? row.category}
                    </TD>
                    <TD className="text-sm">{pendingEmailPartyLabel(row)}</TD>
                    <TD>
                      <Badge
                        variant={
                          row.urgency === "high"
                            ? "critical"
                            : row.urgency === "low"
                              ? "muted"
                              : "active"
                        }
                      >
                        {row.urgency}
                      </Badge>
                    </TD>
                    <TD className={cn("text-sm", row.slaBreached && "font-semibold text-red-600")}>
                      {row.slaDueAt ? formatDate(row.slaDueAt) : "—"}
                      {row.slaBreached && (
                        <span className="ml-1 block text-xs">breached</span>
                      )}
                      {!row.slaBreached &&
                        isPendingEmailDueSoon(row.slaDueAt, row.slaBreached) && (
                          <span className="ml-1 block text-xs text-amber-700">due soon</span>
                        )}
                    </TD>
                    <TD className="max-w-xs truncate text-sm" title={row.subject}>
                      {row.subject}
                    </TD>
                    <TD className="text-sm text-slate-muted">
                      <div>{row.createdByName ?? "Care"}</div>
                      <div className="text-xs">{formatDate(row.createdAt)}</div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPreview(toPreview(row))}
                        >
                          Preview
                        </Button>
                        <Link
                          href={`/care/grievances/${row.ticketId}`}
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-transparent px-3 py-1.5 text-sm font-medium text-text hover:bg-white/80"
                        >
                          Open ticket
                        </Link>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <PendingEmailPreviewModal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        email={preview}
        onActionComplete={load}
        onDraftSaved={(patch) => {
          setPreview((current) => (current ? { ...current, ...patch } : null));
          load();
        }}
      />
    </div>
  );
}
