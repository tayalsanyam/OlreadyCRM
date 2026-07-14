"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";

type CallRow = {
  day: string;
  calls: number;
  durationSec: number;
  leadCalls?: number;
  muaCalls?: number;
  uniqueLeads?: number;
  uniqueMuas?: number;
  answerRate?: number | null;
};

type Totals = {
  totalCalls: number;
  totalDurationSec: number;
  leadCalls: number;
  muaCalls: number;
  uniqueLeads: number;
  uniqueMuas: number;
};

type ScopeOption = { value: string; label: string };

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0m 0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function CallActivityReport({
  apiBase = "/api/reports",
  adminMode = false,
}: {
  apiBase?: "/api/reports" | "/api/admin/reports";
  adminMode?: boolean;
}) {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byStaff, setByStaff] = useState<
    Array<{
      staffId: string;
      staffName: string;
      role: string;
      calls: number;
      durationSec: number;
      lastCallAt: string | null;
      unmatchedCalls: number;
    }>
  >([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assignee, setAssignee] = useState("me");
  const [canFilter, setCanFilter] = useState(false);
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (adminMode) {
      setCanFilter(true);
      setAssignee("all");
      return;
    }
    void (async () => {
      const res = await fetch(`${apiBase}/call-activity/scope`, { cache: "no-store" });
      const body = (await res.json()) as {
        data?: { canFilter: boolean; defaultAssignee: string; options: ScopeOption[] };
      };
      if (!body.data) return;
      setCanFilter(body.data.canFilter);
      setScopeOptions(body.data.options);
      setAssignee(body.data.defaultAssignee);
    })();
  }, [adminMode, apiBase]);

  const load = useCallback(async () => {
    setLoadError(null);
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    if (canFilter || adminMode) qs.set("assignee", assignee);

    const endpoint = adminMode
      ? `${apiBase}/call-activity?${qs}`
      : `${apiBase}/call-activity?${qs}`;

    const res = await fetch(endpoint, { cache: "no-store" });
    const body = (await res.json()) as {
      data?: {
        rows?: CallRow[];
        totals?: Totals | null;
        scopeLabel?: string;
        byStaff?: typeof byStaff;
        staffWithNumbers?: Array<{ id: string; name: string; role: string }>;
      };
      error?: string;
    };
    if (!res.ok || body.error) {
      setLoadError(body.error ?? "Failed to load call activity");
      setRows([]);
      setTotals(null);
      setByStaff([]);
      return;
    }
    setRows(body.data?.rows ?? []);
    setTotals(body.data?.totals ?? null);
    setByStaff(body.data?.byStaff ?? []);
    if (adminMode && body.data?.staffWithNumbers?.length) {
      setScopeOptions([
        { value: "all", label: "All staff with Callyzer" },
        ...body.data.staffWithNumbers.map((s) => ({
          value: s.id,
          label: `${s.name} (${s.role.replace(/_/g, " ")})`,
        })),
      ]);
    }
    setScopeLabel(body.data?.scopeLabel ?? null);
  }, [adminMode, apiBase, assignee, canFilter, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCalls = totals?.totalCalls ?? rows.reduce((s, r) => s + r.calls, 0);
  const totalDuration = totals?.totalDurationSec ?? rows.reduce((s, r) => s + r.durationSec, 0);

  const subtitle = useMemo(() => {
    if (adminMode) return "Org-wide Callyzer call activity by staff and day.";
    return "Your Callyzer-synced calls to leads and MUAs.";
  }, [adminMode]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-brand">Call activity</h2>
        <p className="text-sm text-slate-muted">{subtitle}</p>
        {scopeLabel ? <p className="mt-1 text-xs font-medium text-brand">Viewing: {scopeLabel}</p> : null}
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        {(canFilter || adminMode) && (scopeOptions.length > 0 || adminMode) ? (
          <select
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            {(adminMode && scopeOptions.length === 0
              ? [{ value: "all", label: "All staff with Callyzer" }]
              : scopeOptions
            ).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <Button onClick={() => void load()}>Apply</Button>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Total calls</p>
          <p className="text-2xl font-bold text-brand">{totalCalls}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Talk time</p>
          <p className="text-2xl font-bold text-brand">{formatDuration(totalDuration)}</p>
        </div>
        {!adminMode && totals ? (
          <>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Lead calls</p>
              <p className="text-2xl font-bold text-brand">{totals.leadCalls}</p>
              <p className="text-xs text-slate-muted">{totals.uniqueLeads} unique leads</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">MUA calls</p>
              <p className="text-2xl font-bold text-brand">{totals.muaCalls}</p>
              <p className="text-xs text-slate-muted">{totals.uniqueMuas} unique MUAs</p>
            </div>
          </>
        ) : null}
      </div>

      {adminMode && byStaff.length > 0 ? (
        <Table>
          <THead>
            <TR>
              <TH>Staff</TH>
              <TH>Role</TH>
              <TH>Calls</TH>
              <TH>Duration</TH>
              <TH>Last call</TH>
              <TH>Unmatched</TH>
            </TR>
          </THead>
          <TBody>
            {byStaff.map((r) => (
              <TR key={r.staffId}>
                <TD>{r.staffName}</TD>
                <TD className="text-xs text-slate-muted">{r.role.replace(/_/g, " ")}</TD>
                <TD>{r.calls}</TD>
                <TD>{formatDuration(r.durationSec)}</TD>
                <TD>
                  {r.lastCallAt ? new Date(r.lastCallAt).toLocaleString("en-IN") : "—"}
                </TD>
                <TD>{r.unmatchedCalls}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}

      <Table>
        <THead>
          <TR>
            <TH>Day</TH>
            <TH>Calls</TH>
            <TH>Duration</TH>
            {!adminMode ? (
              <>
                <TH>Lead</TH>
                <TH>MUA</TH>
              </>
            ) : null}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={adminMode ? 3 : 5} className="text-center text-sm text-slate-muted">
                No Callyzer calls in this period. Ensure your Callyzer number is set in Admin → Users.
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.day}>
                <TD>{new Date(r.day).toLocaleDateString("en-IN")}</TD>
                <TD>{r.calls}</TD>
                <TD>{formatDuration(r.durationSec)}</TD>
                {!adminMode ? (
                  <>
                    <TD>{r.leadCalls ?? "—"}</TD>
                    <TD>{r.muaCalls ?? "—"}</TD>
                  </>
                ) : null}
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
