"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  ReportResultLine,
  ReportSummaryChip,
  ReportSummaryChips,
} from "@/components/admin/reports-hub/shared/ReportSummaryChips";
import { adminCsvHref } from "@/lib/admin-csv-export";
import {
  STAFF_ACTIVITY_ENTRY_GROUPS,
  staffActivityEntryGroupForType,
  staffActivityEntryGroupLabel,
  type StaffActivityEntryGroupKey,
} from "@/lib/admin-reports-hub-activity-types";
import type {
  StaffActivityPayload,
  StaffActivityRoleFilter,
} from "@/lib/admin-reports-hub-types";
import { formatDate, cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  regional_rm: "Regional RM",
  commission_rm: "Commission RM",
  lead_uploader: "Lead uploader",
};

function defaultDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return d.toISOString().slice(0, 10);
}

export function StaffActivityReport() {
  const [draftFrom, setDraftFrom] = useState(defaultDateFrom);
  const [draftTo, setDraftTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftRole, setDraftRole] = useState<StaffActivityRoleFilter>("all");
  const [draftStaffId, setDraftStaffId] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftEntryGroups, setDraftEntryGroups] = useState<StaffActivityEntryGroupKey[]>([]);
  const [applied, setApplied] = useState({
    dateFrom: defaultDateFrom(),
    dateTo: new Date().toISOString().slice(0, 10),
    role: "all" as StaffActivityRoleFilter,
    staffId: "",
    search: "",
    entryGroups: [] as StaffActivityEntryGroupKey[],
  });
  const [data, setData] = useState<StaffActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);

  const query = useMemo(() => {
    const p = new URLSearchParams({
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo,
    });
    if (applied.role !== "all") p.set("role", applied.role);
    if (applied.staffId) p.set("staffId", applied.staffId);
    if (applied.search.trim()) p.set("q", applied.search.trim());
    if (applied.entryGroups.length) p.set("entryGroups", applied.entryGroups.join(","));
    return p.toString();
  }, [applied]);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/reports/activity?${query}`)
      .then((r) => r.json())
      .then((json: { data: StaffActivityPayload | null }) => {
        setData(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const url =
      draftRole === "commission_rm"
        ? "/api/admin/rms?role=commission_rm"
        : draftRole === "regional_rm"
          ? "/api/admin/rms"
          : null;
    if (!url) {
      setStaffOptions([]);
      return;
    }
    void fetch(url)
      .then((r) => r.json())
      .then((json: { data: { id: string; name: string }[] }) =>
        setStaffOptions(json.data ?? [])
      );
  }, [draftRole]);

  const filtersDirty =
    draftFrom !== applied.dateFrom ||
    draftTo !== applied.dateTo ||
    draftRole !== applied.role ||
    draftStaffId !== applied.staffId ||
    draftSearch.trim() !== applied.search ||
    draftEntryGroups.join(",") !== applied.entryGroups.join(",");

  function toggleEntryGroup(key: StaffActivityEntryGroupKey) {
    setDraftEntryGroups((current) =>
      current.includes(key) ? current.filter((g) => g !== key) : [...current, key]
    );
  }

  function applyFilters() {
    setApplied({
      dateFrom: draftFrom,
      dateTo: draftTo,
      role: draftRole,
      staffId: draftStaffId,
      search: draftSearch.trim(),
      entryGroups: draftEntryGroups,
    });
  }

  const csvHref = adminCsvHref("/api/admin/reports/activity", query);

  return (
    <div className="space-y-4">
      {data?.summary ? (
        <>
          <ReportSummaryChips title="Activity in range · Regional RM, Commission RM, and Lead uploader only">
            <ReportSummaryChip label="Total entries" value={data.summary.total} />
            <ReportSummaryChip label="Regional RM" value={data.summary.regionalRm} />
            <ReportSummaryChip label="Commission RM" value={data.summary.commissionRm} />
            <ReportSummaryChip label="Lead uploader" value={data.summary.leadUploader} />
          </ReportSummaryChips>
          <ReportSummaryChips title="Tracked activity types">
            {data.summary.entryGroups.map((group) => (
              <ReportSummaryChip
                key={group.key}
                label={group.label}
                value={group.count}
                active={applied.entryGroups.includes(group.key)}
                onClick={() => {
                  const next = applied.entryGroups.includes(group.key)
                    ? applied.entryGroups.filter((g) => g !== group.key)
                    : [...applied.entryGroups, group.key];
                  setDraftEntryGroups(next);
                  setApplied((current) => ({ ...current, entryGroups: next }));
                }}
              />
            ))}
          </ReportSummaryChips>
        </>
      ) : null}

      <Card className="flex flex-wrap items-end gap-4 p-4">
        <Input
          label="From"
          type="date"
          value={draftFrom}
          onChange={(e) => setDraftFrom(e.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={draftTo}
          onChange={(e) => setDraftTo(e.target.value)}
        />
        <label className="text-sm">
          Role
          <select
            className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
            value={draftRole}
            onChange={(e) => {
              setDraftRole(e.target.value as StaffActivityRoleFilter);
              setDraftStaffId("");
            }}
          >
            <option value="all">All roles</option>
            <option value="regional_rm">Regional RM</option>
            <option value="commission_rm">Commission RM</option>
            <option value="lead_uploader">Lead uploader</option>
          </select>
        </label>
        <label className="text-sm">
          Staff
          <select
            className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
            value={draftStaffId}
            onChange={(e) => setDraftStaffId(e.target.value)}
            disabled={draftRole === "all" || draftRole === "lead_uploader"}
          >
            <option value="">
              {draftRole === "all" || draftRole === "lead_uploader"
                ? "Filter by RM role first"
                : "Any in role"}
            </option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-[220px] flex-1 max-w-md">
          <Input
            label="Search"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            placeholder="Lead, phone, or description"
          />
        </div>
        <Button type="button" onClick={applyFilters} disabled={!filtersDirty}>
          Apply
        </Button>
        <a href={csvHref} className="ml-auto">
          <Button type="button" variant="secondary" disabled={loading || !data?.rows.length}>
            Download CSV
          </Button>
        </a>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">Activity type</p>
        <div className="flex flex-wrap gap-2">
          {STAFF_ACTIVITY_ENTRY_GROUPS.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => toggleEntryGroup(group.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                draftEntryGroups.includes(group.key)
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-muted hover:bg-slate-200"
              )}
            >
              {group.label}
            </button>
          ))}
          {draftEntryGroups.length > 0 ? (
            <button
              type="button"
              onClick={() => setDraftEntryGroups([])}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-muted underline"
            >
              Clear types
            </button>
          ) : null}
        </div>
      </div>

      <ReportResultLine>
        Showing {data?.rows.length ?? 0} entries
        {applied.role !== "all" ? (
          <>
            {" "}
            · <strong>{ROLE_LABELS[applied.role] ?? applied.role}</strong>
          </>
        ) : null}
        {applied.search ? (
          <>
            {" "}
            · search <strong>{applied.search}</strong>
          </>
        ) : null}
        {applied.entryGroups.length ? (
          <>
            {" "}
            ·{" "}
            {applied.entryGroups.map((key) => staffActivityEntryGroupLabel(key)).join(", ")}
          </>
        ) : null}
        . Up to 500 rows per load.
      </ReportResultLine>

      <Card className="overflow-x-auto p-0">
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Role</TH>
              <TH>Staff</TH>
              <TH>Lead</TH>
              <TH>Type</TH>
              <TH>Activity</TH>
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-slate-muted">
                  Loading…
                </TD>
              </TR>
            ) : (data?.rows ?? []).length === 0 ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-slate-muted">
                  No activity in this range
                </TD>
              </TR>
            ) : (
              (data?.rows ?? []).map((row) => {
                const groupKey = staffActivityEntryGroupForType(row.entryType);
                return (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap text-sm text-slate-muted">
                    {formatDate(row.createdAt.slice(0, 10))}
                    <span className="block text-xs">
                      {new Date(row.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </TD>
                  <TD className="text-sm">
                    <Badge variant="muted">{ROLE_LABELS[row.actorRole] ?? row.actorRole}</Badge>
                  </TD>
                  <TD className="text-sm">{row.actorName ?? "—"}</TD>
                  <TD className="text-sm">
                    {row.leadId ? (
                      <>
                        <Link
                          href={`/rm/leads/${row.leadId}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {row.brideName ?? row.leadDisplayId}
                        </Link>
                        {row.leadDisplayId ? (
                          <span className="block text-xs text-slate-muted">{row.leadDisplayId}</span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-sm">
                    {groupKey ? (
                      <Badge variant="muted">{staffActivityEntryGroupLabel(groupKey)}</Badge>
                    ) : (
                      <span className="text-slate-muted">—</span>
                    )}
                  </TD>
                  <TD className="text-sm">
                    <span
                      className={cn(
                        "mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                        "bg-slate-100 text-slate-700"
                      )}
                    >
                      {row.entryType.replace(/_/g, " ")}
                    </span>
                    {row.description}
                  </TD>
                </TR>
              );
              })
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
