"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  ReportResultLine,
  ReportSummaryChip,
  ReportSummaryChips,
} from "@/components/admin/reports-hub/shared/ReportSummaryChips";
import {
  RM_OVERVIEW_STATUS_FILTERS,
  RM_OVERVIEW_STATUS_LABELS,
  rmOverviewStatusLabel,
  type RmOverviewRoleFilter,
  type RmOverviewStatusFilter,
} from "@/lib/rm-lead-overview-filters";
import { cn, formatDate } from "@/lib/utils";

type OverviewRow = {
  id: string;
  displayId: string;
  brideName: string;
  region: string | null;
  budgetTier: string;
  status: string;
  leadPhase: string | null;
  eventDate: string | null;
  rmId: string | null;
  rmName: string | null;
  rmRole: string | null;
  funnelStage: string;
  latestPushStage: string | null;
  pushCount: number;
  bookingCount: number;
  lastActivityType: string | null;
  lastActivitySummary: string | null;
  lastActivityAt: string | null;
  lastContactAt: string | null;
};

type RmOption = { id: string; name: string; region: string | null };

type CommRow = {
  id: string;
  entryType: string;
  description: string;
  createdAt: string;
  actorName?: string;
};

const ROLE_TABS: { id: RmOverviewRoleFilter; label: string }[] = [
  { id: "all", label: "All RMs" },
  { id: "regional_rm", label: "Regional" },
  { id: "commission_rm", label: "Commission" },
];

const PUSH_STAGE_LABEL: Record<string, string> = {
  initial_contact: "Initial contact",
  offer_sent: "Offer sent",
  follow_up_done: "Follow-up done",
  negotiating: "Negotiating",
  bride_selected: "Bride selected",
};

function formatActivityType(raw: string | null) {
  if (!raw) return "—";
  return raw.replace(/_/g, " ");
}

export function RmLeadOverviewReport() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rmRole, setRmRole] = useState<RmOverviewRoleFilter>("all");
  const [rmId, setRmId] = useState("");
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<RmOverviewStatusFilter[]>([]);
  const [eventFrom, setEventFrom] = useState("");
  const [eventTo, setEventTo] = useState("");
  const [rms, setRms] = useState<RmOption[]>([]);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [expandedComms, setExpandedComms] = useState<CommRow[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);

  useEffect(() => {
    const url =
      rmRole === "commission_rm"
        ? "/api/admin/rms?role=commission_rm"
        : rmRole === "regional_rm"
          ? "/api/admin/rms"
          : null;
    if (!url) {
      void Promise.all([
        fetch("/api/admin/rms").then((r) => r.json()),
        fetch("/api/admin/rms?role=commission_rm").then((r) => r.json()),
      ]).then(([regionalJson, commissionJson]: [{ data: RmOption[] }, { data: RmOption[] }]) => {
        setRms([...(regionalJson.data ?? []), ...(commissionJson.data ?? [])]);
      });
      return;
    }
    void fetch(url)
      .then((r) => r.json())
      .then((json: { data: RmOption[] }) => setRms(json.data ?? []));
  }, [rmRole]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (rmRole !== "all") p.set("rmRole", rmRole);
    if (rmId) p.set("rmId", rmId);
    if (region) p.set("region", region);
    if (search.trim()) p.set("q", search.trim());
    if (selectedStatuses.length) p.set("statuses", selectedStatuses.join(","));
    if (eventFrom) p.set("eventFrom", eventFrom);
    if (eventTo) p.set("eventTo", eventTo);
    return p.toString();
  }, [rmRole, rmId, region, search, selectedStatuses, eventFrom, eventTo]);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/reports/rm-lead-overview?${query}`)
      .then((r) => r.json())
      .then((json: { data: { rows: OverviewRow[] } }) => {
        setRows(json.data?.rows ?? []);
        setExpandedLeadId(null);
        setExpandedComms([]);
      })
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleStatus(status: RmOverviewStatusFilter) {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }

  async function toggleComms(leadId: string) {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      setExpandedComms([]);
      return;
    }
    setExpandedLeadId(leadId);
    setCommsLoading(true);
    const res = await fetch(`/api/leads/${leadId}/comms?limit=40`);
    const json = (await res.json()) as { data: CommRow[] };
    setExpandedComms(json.data ?? []);
    setCommsLoading(false);
  }

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = rmOverviewStatusLabel(row.status, row.leadPhase);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-brand">RM lead portfolio</h2>
        <p className="text-sm text-slate-muted">
          Assigned leads by RM — current funnel stage, push stage, activity, and full timeline on
          expand.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ROLE_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setRmRole(id);
              setRmId("");
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              rmRole === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-slate-muted">RM</span>
          <select
            className="mt-1 block min-w-[160px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={rmId}
            onChange={(e) => setRmId(e.target.value)}
          >
            <option value="">All in role</option>
            {rms.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
                {rm.region ? ` (${rm.region})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-muted">Search</span>
          <Input
            className="mt-1 min-w-[180px]"
            placeholder="Bride or lead ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-muted">Event from</span>
          <Input
            type="date"
            className="mt-1"
            value={eventFrom}
            onChange={(e) => setEventFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-muted">Event to</span>
          <Input type="date" className="mt-1" value={eventTo} onChange={(e) => setEventTo(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-1 pb-1">
          {["", "north", "east", "west", "south"].map((r) => (
            <button
              key={r || "all"}
              type="button"
              onClick={() => setRegion(r)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                region === r ? "bg-brand text-white" : "bg-slate-100"
              )}
            >
              {r || "All regions"}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" onClick={load}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            window.location.href = `/api/admin/reports/rm-lead-overview?${query}&format=csv`;
          }}
        >
          Export CSV ↓
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-muted">Status filters</p>
        <div className="flex flex-wrap gap-2">
          {RM_OVERVIEW_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                selectedStatuses.includes(status)
                  ? "bg-accent text-white"
                  : "bg-slate-100 text-slate-muted"
              )}
            >
              {RM_OVERVIEW_STATUS_LABELS[status]}
            </button>
          ))}
          {selectedStatuses.length > 0 ? (
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() => setSelectedStatuses([])}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {statusCounts.length > 0 ? (
        <ReportSummaryChips title="In results">
          {statusCounts.map(([label, count]) => (
            <ReportSummaryChip key={label} label={label} value={count} />
          ))}
        </ReportSummaryChips>
      ) : null}

      <ReportResultLine>
        {loading ? "Loading…" : `${rows.length} lead${rows.length === 1 ? "" : "s"} with assigned RM`}
      </ReportResultLine>

      <Table>
        <THead>
          <TR>
            <TH>Lead</TH>
            <TH>RM</TH>
            <TH>Status</TH>
            <TH>Funnel</TH>
            <TH>Push stage</TH>
            <TH>Work done</TH>
            <TH>Last contact</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TR>
                <TD>
                  <Link href={`/rm/leads/${row.id}`} className="font-medium text-accent hover:underline">
                    {row.displayId}
                  </Link>
                  <p className="text-sm">{row.brideName}</p>
                  <p className="text-xs capitalize text-slate-muted">
                    {[row.region, row.budgetTier?.replace("_", " ")].filter(Boolean).join(" · ")}
                  </p>
                </TD>
                <TD>
                  <p className="text-sm font-medium">{row.rmName ?? "—"}</p>
                  <Badge variant="muted" className="mt-0.5 text-[10px]">
                    {row.rmRole === "commission_rm" ? "Commission" : "Regional"}
                  </Badge>
                </TD>
                <TD>
                  <p className="text-sm capitalize">
                    {rmOverviewStatusLabel(row.status, row.leadPhase)}
                  </p>
                  {row.leadPhase && row.leadPhase !== row.status ? (
                    <p className="text-xs text-slate-muted">{row.leadPhase.replace(/_/g, " ")}</p>
                  ) : null}
                </TD>
                <TD className="text-sm">{row.funnelStage}</TD>
                <TD className="text-sm capitalize">
                  {row.latestPushStage
                    ? PUSH_STAGE_LABEL[row.latestPushStage] ?? row.latestPushStage.replace(/_/g, " ")
                    : "—"}
                </TD>
                <TD className="max-w-[220px]">
                  <p className="text-xs text-slate-muted">
                    {row.pushCount} push{row.pushCount === 1 ? "" : "es"} · {row.bookingCount} booking
                    {row.bookingCount === 1 ? "" : "s"}
                  </p>
                  {row.lastActivityAt ? (
                    <p className="mt-1 text-xs">
                      <span className="font-medium capitalize">
                        {formatActivityType(row.lastActivityType)}
                      </span>
                      {" · "}
                      {formatDate(row.lastActivityAt)}
                    </p>
                  ) : null}
                  {row.lastActivitySummary ? (
                    <p className="truncate text-xs text-slate-muted">{row.lastActivitySummary}</p>
                  ) : null}
                </TD>
                <TD className="text-sm">{row.lastContactAt ? formatDate(row.lastContactAt) : "—"}</TD>
                <TD>
                  <button
                    type="button"
                    className="text-xs font-medium text-accent hover:underline"
                    onClick={() => void toggleComms(row.id)}
                  >
                    {expandedLeadId === row.id ? "Hide" : "Activity"}
                  </button>
                </TD>
              </TR>
              {expandedLeadId === row.id ? (
                <TR key={`${row.id}-activity`}>
                  <TD colSpan={8} className="bg-slate-50">
                    {commsLoading ? (
                      <p className="text-sm text-slate-muted">Loading activity…</p>
                    ) : expandedComms.length === 0 ? (
                      <p className="text-sm text-slate-muted">No activity logged.</p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto py-2">
                        {expandedComms.map((c) => (
                          <div key={c.id} className="border-b border-slate-200 pb-2 text-sm last:border-0">
                            <p className="text-xs text-slate-muted">
                              {formatDate(c.createdAt)} ·{" "}
                              <span className="capitalize">{formatActivityType(c.entryType)}</span>
                              {c.actorName ? ` · ${c.actorName}` : ""}
                            </p>
                            <p>{c.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TD>
                </TR>
              ) : null}
            </Fragment>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
