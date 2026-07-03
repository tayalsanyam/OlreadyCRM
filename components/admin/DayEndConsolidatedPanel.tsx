"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { DayEndFormByTemplate } from "@/components/day-end/DayEndForm";
import type { DayEndTemplateKey } from "@/lib/day-end";
import { formatTalkTime } from "@/lib/day-end";
import {
  consolidatedRowsToCsvSections,
  DAY_END_TEMPLATE_LABELS,
  summarizeDayEndPayload,
} from "@/lib/day-end-consolidated-export";
import type { DayEndConsolidatedOverview, DayEndConsolidatedRow } from "@/lib/day-end-queries";
import {
  buildOverviewDateQuery,
  overviewDateRangeLabel,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import { downloadOverviewCsv } from "@/lib/download-overview-csv";
import { formatDate } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  salesRm: "Sales RM",
  salesTl: "Sales TL",
  salesActivation: "Activation",
  leadUploader: "Uploader",
  feedbackRm: "Feedback",
  regionalRm: "Regional RM",
  commissionRm: "Commission RM",
  careAgent: "Care",
};

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
];

const TEMPLATE_OPTIONS = [
  { value: "", label: "All templates" },
  ...Object.entries(DAY_END_TEMPLATE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

type Props = {
  dateRange: OverviewDateRange;
  active: boolean;
};

export function DayEndConsolidatedPanel({ dateRange, active }: Props) {
  const [data, setData] = useState<DayEndConsolidatedOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [templateFilter, setTemplateFilter] = useState<DayEndTemplateKey | "">("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (range: OverviewDateRange) => {
    setLoading(true);
    try {
      const qs = buildOverviewDateQuery(range);
      const res = await fetch(`/api/admin/day-end/consolidated?${qs}`, { cache: "no-store" });
      const json = (await res.json()) as { data: DayEndConsolidatedOverview | null };
      setData(json.data);
      setExpandedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void load(dateRange);
  }, [active, dateRange, load]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter && row.staffRole !== roleFilter) return false;
      if (templateFilter && row.templateKey !== templateFilter) return false;
      if (q) {
        const haystack = [
          row.staffName,
          ROLE_LABELS[row.staffRole] ?? row.staffRole,
          DAY_END_TEMPLATE_LABELS[row.templateKey],
          summarizeDayEndPayload(row.templateKey, row.payload).highlights,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data?.rows, roleFilter, templateFilter, search]);

  function downloadCsv() {
    const label = overviewDateRangeLabel(dateRange).replace(/\s+/g, "_");
    downloadOverviewCsv(
      `day-end-consolidated-${label}`,
      consolidatedRowsToCsvSections(filteredRows, ROLE_LABELS, overviewDateRangeLabel(dateRange)),
    );
  }

  function toggleExpand(row: DayEndConsolidatedRow) {
    setExpandedId((prev) => (prev === row.id ? null : row.id));
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <Select
              label="Role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={ROLE_OPTIONS}
            />
          </div>
          <div className="min-w-[10rem] flex-1">
            <Select
              label="Template"
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value as DayEndTemplateKey | "")}
              options={TEMPLATE_OPTIONS}
            />
          </div>
          <div className="min-w-[12rem] flex-[2]">
            <Input
              label="Search"
              placeholder="Name, role, highlights…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" onClick={downloadCsv} disabled={filteredRows.length === 0}>
            Download CSV
          </Button>
        </div>
        <p className="mt-3 text-sm text-slate-muted">
          {filteredRows.length} submitted report{filteredRows.length === 1 ? "" : "s"} ·{" "}
          {overviewDateRangeLabel(dateRange)}
          {loading ? " · Loading…" : null}
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <THead>
            <TR>
              <TH>Staff</TH>
              <TH>Role</TH>
              <TH>Date</TH>
              <TH>Template</TH>
              <TH>Calls</TH>
              <TH>Talk time</TH>
              <TH>Highlights</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {filteredRows.map((row) => {
              const summary = summarizeDayEndPayload(row.templateKey, row.payload);
              const expanded = expandedId === row.id;
              return (
                <TR key={row.id} className={expanded ? "bg-slate-50" : undefined}>
                  <TD className="font-medium">{row.staffName}</TD>
                  <TD>{ROLE_LABELS[row.staffRole] ?? row.staffRole}</TD>
                  <TD>{formatDate(row.reportDate)}</TD>
                  <TD>
                    <Badge variant="muted">
                      {DAY_END_TEMPLATE_LABELS[row.templateKey] ?? row.templateKey}
                    </Badge>
                  </TD>
                  <TD>{summary.calls ?? "—"}</TD>
                  <TD>{summary.talkTimeSec != null ? formatTalkTime(summary.talkTimeSec) : "—"}</TD>
                  <TD className="max-w-xs truncate text-sm text-slate-muted" title={summary.highlights}>
                    {summary.highlights || "—"}
                  </TD>
                  <TD>
                    <Button type="button" variant="ghost" size="sm" onClick={() => toggleExpand(row)}>
                      {expanded ? "Hide" : "View"}
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {!loading && filteredRows.length === 0 && (
          <p className="p-4 text-sm text-slate-muted">No submitted reports match your filters.</p>
        )}
      </Card>

      {filteredRows
        .filter((row) => row.id === expandedId)
        .map((row) => (
          <Card key={row.id} className="p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-text">{row.staffName}</h2>
                <p className="text-sm text-slate-muted">
                  {formatDate(row.reportDate)} · {ROLE_LABELS[row.staffRole] ?? row.staffRole} · Submitted{" "}
                  {formatDate(row.submittedAt)}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpandedId(null)}>
                Close
              </Button>
            </div>
            <DayEndFormByTemplate
              templateKey={row.templateKey}
              payload={row.payload as Record<string, unknown>}
              onChange={() => {}}
              readOnly
            />
          </Card>
        ))}
    </div>
  );
}
