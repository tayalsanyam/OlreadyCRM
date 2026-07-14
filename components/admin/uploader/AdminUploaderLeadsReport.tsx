"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PhoneLeadHistoryModal } from "@/components/upload/PhoneLeadHistoryModal";
import { UploaderCloseLeadModal } from "@/components/upload/UploaderCloseLeadModal";
import { VerifiedLeadManageModal } from "@/components/upload/VerifiedLeadManageModal";
import { adminCsvHref } from "@/lib/admin-csv-export";
import {
  defaultOverviewDateRange,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import {
  UPLOADER_LEADS_REPORT_ROUTING_LABELS,
  UPLOADER_LEADS_REPORT_ROUTING_ORDER,
  UPLOADER_LEADS_REPORT_STATUS_LABELS,
  UPLOADER_LEADS_REPORT_STATUS_ORDER,
  canCloseUploaderReportLead,
  canManageUploaderReportLead,
  uploaderLeadsReportDateScopeLabel,
  type UploaderLeadReportRow,
  type UploaderLeadsReportPayload,
  type UploaderLeadsReportRouting,
  type UploaderLeadsReportStatus,
} from "@/lib/admin-uploader-leads-report-types";
import { BUDGET_TIER_LABELS, type Region } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const REGIONS: { value: Region; label: string }[] = [
  { value: "north", label: "North" },
  { value: "east", label: "East" },
  { value: "west", label: "West" },
  { value: "south", label: "South" },
];

function lastContactLabel(row: UploaderLeadReportRow): string {
  if (!row.lastContactAt) return "—";
  const when = formatDate(row.lastContactAt);
  if (row.lastContactChannel === "whatsapp") return `${when} · WhatsApp`;
  return `${when} · Call`;
}

function routingLabel(row: UploaderLeadReportRow): string {
  if (!row.routing) return "—";
  return row.routing;
}

function routingDetail(row: UploaderLeadReportRow): string | null {
  if (row.routing === "RM pool") return "Not assigned";
  if (row.assignedTo && (row.routing === "RM" || row.routing === "Commission")) {
    return row.assignedTo;
  }
  return null;
}

function budgetLabel(row: UploaderLeadReportRow): string {
  const parts: string[] = [];
  if (row.budgetAmount != null) {
    parts.push(`Rs. ${row.budgetAmount.toLocaleString("en-IN")}`);
  }
  if (row.budgetTier) {
    parts.push(BUDGET_TIER_LABELS[row.budgetTier]);
  }
  return parts.length ? parts.join(" · ") : "—";
}

function StatusCountChip({
  statusKey,
  count,
  active,
  onClick,
}: {
  statusKey: UploaderLeadsReportStatus;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-brand bg-brand/5"
          : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      <p className="text-xs text-slate-muted">{UPLOADER_LEADS_REPORT_STATUS_LABELS[statusKey]}</p>
      <p className="text-lg font-semibold text-brand">{count.toLocaleString("en-IN")}</p>
    </button>
  );
}

export function AdminUploaderLeadsReport() {
  const [dateRange, setDateRange] = useState<OverviewDateRange>(defaultOverviewDateRange);
  const [appliedRange, setAppliedRange] = useState<OverviewDateRange>(defaultOverviewDateRange);
  const [allTime, setAllTime] = useState(false);
  const [appliedAllTime, setAppliedAllTime] = useState(false);
  const [status, setStatus] = useState<UploaderLeadsReportStatus>("all");
  const [appliedStatus, setAppliedStatus] = useState<UploaderLeadsReportStatus>("all");
  const [routing, setRouting] = useState<UploaderLeadsReportRouting>("all");
  const [appliedRouting, setAppliedRouting] = useState<UploaderLeadsReportRouting>("all");
  const [region, setRegion] = useState("");
  const [appliedRegion, setAppliedRegion] = useState("");
  const [state, setState] = useState("");
  const [appliedState, setAppliedState] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [data, setData] = useState<UploaderLeadsReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLead, setHistoryLead] = useState<UploaderLeadReportRow | null>(null);
  const [manageLead, setManageLead] = useState<UploaderLeadReportRow | null>(null);
  const [closeLead, setCloseLead] = useState<UploaderLeadReportRow | null>(null);

  useEffect(() => {
    void fetch("/api/admin/uploader/leads-report?meta=filters")
      .then((r) => r.json())
      .then((json: { data?: { states?: string[] } }) => {
        setStates(json.data?.states ?? []);
      });
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams({
      dateFrom: appliedRange.dateFrom,
      dateTo: appliedRange.dateTo,
      status: appliedStatus,
    });
    if (appliedAllTime) p.set("allTime", "1");
    if (appliedRouting !== "all") p.set("routing", appliedRouting);
    if (appliedRegion) p.set("region", appliedRegion);
    if (appliedState) p.set("state", appliedState);
    return p.toString();
  }, [appliedRange, appliedAllTime, appliedStatus, appliedRouting, appliedRegion, appliedState]);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/uploader/leads-report?${query}`)
      .then((r) => r.json())
      .then((json: { data: UploaderLeadsReportPayload | null }) => {
        setData(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const filtersDirty =
    dateRange.dateFrom !== appliedRange.dateFrom ||
    dateRange.dateTo !== appliedRange.dateTo ||
    allTime !== appliedAllTime ||
    status !== appliedStatus ||
    routing !== appliedRouting ||
    region !== appliedRegion ||
    state !== appliedState;

  function applyFilters() {
    setAppliedRange(dateRange);
    setAppliedAllTime(allTime);
    setAppliedStatus(status);
    setAppliedRouting(routing);
    setAppliedRegion(region);
    setAppliedState(state);
  }

  function applyStatusFilter(next: UploaderLeadsReportStatus) {
    setStatus(next);
    setAppliedStatus(next);
    setAppliedRange(dateRange);
    setAppliedAllTime(allTime);
    setAppliedRouting(routing);
    setAppliedRegion(region);
    setAppliedState(state);
  }

  const csvHref = adminCsvHref("/api/admin/uploader/leads-report", query);

  const statusCounts = data?.statusCounts;
  const totalInRange = data?.totalInRange ?? 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-brand">
          Status counts · leads added{" "}
          {uploaderLeadsReportDateScopeLabel(appliedRange, appliedAllTime)}
          {appliedRegion ? ` · ${appliedRegion}` : ""}
          {appliedState ? ` · ${appliedState}` : ""}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <StatusCountChip
            statusKey="all"
            count={totalInRange}
            active={appliedStatus === "all"}
            onClick={() => applyStatusFilter("all")}
          />
          {UPLOADER_LEADS_REPORT_STATUS_ORDER.filter((key) => key !== "all").map((key) => (
            <StatusCountChip
              key={key}
              statusKey={key}
              count={statusCounts?.[key] ?? 0}
              active={appliedStatus === key}
              onClick={() => applyStatusFilter(key)}
            />
          ))}
        </div>
      </Card>

      <Card className="flex flex-wrap items-end gap-4 p-4">
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={allTime}
            onChange={(e) => setAllTime(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span>All time</span>
        </label>
        <Input
          label="Added from"
          type="date"
          value={dateRange.dateFrom}
          disabled={allTime}
          onChange={(e) => setDateRange((r) => ({ ...r, dateFrom: e.target.value }))}
        />
        <Input
          label="Added to"
          type="date"
          value={dateRange.dateTo}
          disabled={allTime}
          onChange={(e) => setDateRange((r) => ({ ...r, dateTo: e.target.value }))}
        />
        <label className="text-sm">
          Lead status
          <select
            className="mt-1 block min-w-[12rem] rounded border border-slate-200 px-2 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as UploaderLeadsReportStatus)}
          >
            {UPLOADER_LEADS_REPORT_STATUS_ORDER.map((key) => (
              <option key={key} value={key}>
                {UPLOADER_LEADS_REPORT_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Routing
          <select
            className="mt-1 block min-w-[12rem] rounded border border-slate-200 px-2 py-2 text-sm"
            value={routing}
            onChange={(e) => setRouting(e.target.value as UploaderLeadsReportRouting)}
          >
            {UPLOADER_LEADS_REPORT_ROUTING_ORDER.map((key) => (
              <option key={key} value={key}>
                {UPLOADER_LEADS_REPORT_ROUTING_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Region
          <select
            className="mt-1 block min-w-[8rem] rounded border border-slate-200 px-2 py-2 text-sm capitalize"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            <option value="">All</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          State
          <select
            className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">All</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={applyFilters} disabled={!filtersDirty}>
          Apply
        </Button>
        <a href={csvHref} className="ml-auto">
          <Button type="button" variant="secondary" disabled={loading || !data?.rows.length}>
            Download CSV
          </Button>
        </a>
      </Card>

      <p className="text-sm text-slate-muted">
        Showing {data?.total ?? 0} row{(data?.total ?? 0) === 1 ? "" : "s"}
        {appliedAllTime ? (
          <>
            {" "}
            · <strong>all time</strong> (no added-date limit)
          </>
        ) : null}
        {appliedStatus !== "all" && (
          <>
            {" "}
            · status <strong>{UPLOADER_LEADS_REPORT_STATUS_LABELS[appliedStatus]}</strong>
          </>
        )}
        {appliedRouting !== "all" && (
          <>
            {" "}
            · routing <strong>{UPLOADER_LEADS_REPORT_ROUTING_LABELS[appliedRouting]}</strong>
          </>
        )}
        . Up to 2,500 rows per load. Contact count = calls, WhatsApp, and Callyzer touches on the
        lead.
      </p>

      <Card className="overflow-x-auto p-0">
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Phone</TH>
              <TH>Location</TH>
              <TH>Budget</TH>
              <TH>Event date</TH>
              <TH>MUA pushes</TH>
              <TH>Status</TH>
              <TH>Routing</TH>
              <TH>Added</TH>
              <TH>Contacts</TH>
              <TH>Last contact</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD colSpan={12} className="py-8 text-center text-slate-muted">
                  Loading…
                </TD>
              </TR>
            ) : (data?.rows ?? []).length === 0 ? (
              <TR>
                <TD colSpan={12} className="py-8 text-center text-slate-muted">
                  No leads match these filters
                </TD>
              </TR>
            ) : (
              (data?.rows ?? []).map((row) => {
                const routingSub = routingDetail(row);
                return (
                <TR key={row.id}>
                  <TD>
                    <Link
                      href={`/rm/leads/${row.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {row.brideName}
                    </Link>
                    <p className="text-xs text-slate-muted">{row.displayId}</p>
                    {row.source && (
                      <p className="text-xs text-slate-muted">Source: {row.source}</p>
                    )}
                  </TD>
                  <TD className="text-sm whitespace-nowrap">{row.phone}</TD>
                  <TD className="text-sm">
                    {row.city}
                    {row.state && (
                      <span className="block text-xs text-slate-muted">{row.state}</span>
                    )}
                    <span className="block text-xs capitalize text-slate-muted">{row.region}</span>
                  </TD>
                  <TD className="text-sm whitespace-nowrap">{budgetLabel(row)}</TD>
                  <TD className="text-sm whitespace-nowrap">
                    {row.eventDate ? (
                      <div className="space-y-1">
                        <span className={row.isExpired ? "text-red-700" : undefined}>
                          {formatDate(row.eventDate)}
                        </span>
                        {row.isExpired ? (
                          <Badge variant="critical">Expired</Badge>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-sm font-medium">{row.muaPushCount}</TD>
                  <TD>
                    <Badge variant="muted">{row.workspaceStatus}</Badge>
                    {row.workspaceStatus === "Pending verification" &&
                      row.verificationConnectAttempts > 0 && (
                        <p className="mt-1 text-xs text-slate-muted">
                          Connect {row.verificationConnectAttempts}/2
                        </p>
                      )}
                  </TD>
                  <TD className="text-sm">
                    <span className="font-medium">{routingLabel(row)}</span>
                    {routingSub ? (
                      <span className="block text-xs text-slate-muted">{routingSub}</span>
                    ) : null}
                  </TD>
                  <TD className="text-sm whitespace-nowrap">{formatDate(row.createdAt)}</TD>
                  <TD className="text-sm font-medium">{row.contactCount}</TD>
                  <TD className="text-sm text-slate-muted">{lastContactLabel(row)}</TD>
                  <TD>
                    <div className="flex min-w-[11rem] flex-col gap-1">
                      <Link href={`/rm/leads/${row.id}`}>
                        <Button type="button" size="sm" variant="secondary" className="w-full">
                          Profile
                        </Button>
                      </Link>
                      {canManageUploaderReportLead(row) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={() => setManageLead(row)}
                        >
                          Manage
                        </Button>
                      ) : null}
                      {canCloseUploaderReportLead(row) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="w-full text-red-700 hover:bg-red-50"
                          onClick={() => setCloseLead(row)}
                        >
                          Close
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setHistoryLead(row)}
                      >
                        History
                      </Button>
                    </div>
                  </TD>
                </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>

      {historyLead && (
        <PhoneLeadHistoryModal
          open={!!historyLead}
          onClose={() => setHistoryLead(null)}
          leadId={historyLead.id}
          phone={historyLead.phone}
          brideName={historyLead.brideName}
          displayId={historyLead.displayId}
          excludeLeadId={historyLead.id}
        />
      )}

      {manageLead && (
        <VerifiedLeadManageModal
          open={!!manageLead}
          onClose={() => setManageLead(null)}
          leadId={manageLead.id}
          brideName={manageLead.brideName}
          region={manageLead.region as Region}
          portalOnly={manageLead.portalOnly}
          status={manageLead.dbStatus}
          assignedRmId={manageLead.assignedRmId}
          assignedRmName={manageLead.assignedTo}
          onSaved={load}
        />
      )}

      {closeLead && (
        <UploaderCloseLeadModal
          open={!!closeLead}
          onClose={() => setCloseLead(null)}
          leadId={closeLead.id}
          brideName={closeLead.brideName}
          onSaved={load}
        />
      )}
    </div>
  );
}
