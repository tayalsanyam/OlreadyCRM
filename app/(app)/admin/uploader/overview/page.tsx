"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { buildUploaderOverviewSections } from "@/lib/uploader-overview-export";
import { downloadOverviewCsv } from "@/lib/download-overview-csv";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";
import type { AdminUploaderOverview } from "@/lib/admin-uploader-overview-query";
import { OverviewDateRangeFilter } from "@/components/admin/OverviewDateRangeFilter";
import {
  buildOverviewDateQuery,
  defaultOverviewDateRange,
  overviewDateRangeLabel,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import { cn, formatDate } from "@/lib/utils";

const UPLOAD_TAB_LABELS = {
  pending: "Not verified",
  verified: "Verified",
  review: LEAD_EXIT_LABELS.uploaderReview,
  closed: LEAD_EXIT_LABELS.uploaderClosed,
} as const;

const UPLOAD_TAB_HREFS: Record<keyof typeof UPLOAD_TAB_LABELS, string> = {
  pending: "/upload/leads?tab=pending",
  verified: "/upload/leads?tab=verified",
  review: "/upload/leads?tab=review",
  closed: "/upload/leads?tab=closed",
};

function MetricLink({
  label,
  value,
  href,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  href: string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "ok" | "muted";
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-red-600"
        : tone === "ok"
          ? "text-emerald-700"
          : tone === "muted"
            ? "text-slate-muted"
            : "text-brand";

  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5 transition-colors hover:border-accent/30 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="text-xs text-slate-muted">{label}</p>
        {hint ? <p className="truncate text-[11px] text-slate-400">{hint}</p> : null}
      </div>
      <span className={cn("shrink-0 text-lg font-semibold tabular-nums", toneClass)}>
        {value.toLocaleString("en-IN")}
      </span>
    </Link>
  );
}

function PipelineStep({
  label,
  value,
  href,
  sub,
  last = false,
}: {
  label: string;
  value: number;
  href: string;
  sub?: string;
  last?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-2">
      <Link
        href={href}
        className="group min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm transition hover:border-accent/40 hover:shadow"
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-muted">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-brand group-hover:text-accent">
          {value.toLocaleString("en-IN")}
        </p>
        {sub ? <p className="mt-0.5 text-[11px] text-slate-muted">{sub}</p> : null}
      </Link>
      {!last ? (
        <span className="hidden self-center text-slate-300 sm:inline" aria-hidden>
          →
        </span>
      ) : null}
    </div>
  );
}

export default function AdminUploaderOverviewPage() {
  const [data, setData] = useState<AdminUploaderOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<OverviewDateRange>(defaultOverviewDateRange);

  const load = useCallback(async (range: OverviewDateRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/uploader/overview?${buildOverviewDateQuery(range)}`);
      const json = await res.json();
      setData(json.data ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(defaultOverviewDateRange());
  }, [load]);

  const periodLabel = overviewDateRangeLabel(data?.dateRange ?? dateRange);

  const tabs = data?.tabs ?? {
    pending: 0,
    verified: 0,
    review: 0,
    closed: 0,
  };

  const verifiedRouting = data?.verifiedRouting ?? {
    rmQueue: 0,
    assigned: 0,
    commission: 0,
    portal: 0,
  };

  const niBreakdown = data?.notInterestedBreakdown ?? {
    pendingReview: 0,
    confirmedNi: 0,
    rmError: 0,
    reopen: 0,
  };

  const mtd = data?.mtd ?? {
    added: 0,
    verified: 0,
    rejected: 0,
    notAnswering: 0,
    niClosed: 0,
    deactivated: 0,
  };

  const staffTotals = useMemo(() => {
    const rows = data?.staff ?? [];
    return {
      added: rows.reduce((n, s) => n + s.addedMtd, 0),
      verified: rows.reduce((n, s) => n + s.verifiedMtd, 0),
      rejected: rows.reduce((n, s) => n + s.rejectedMtd, 0),
      overdue: rows.reduce((n, s) => n + s.overdueTasks, 0),
    };
  }, [data]);

  const uploaderReviewTotal = tabs.review;

  const attentionItems = [
    tabs.pending > 0 && {
      label: `${tabs.pending} awaiting verification`,
      href: "/upload/leads?tab=pending",
      tone: tabs.pending >= 10 ? "danger" : "warn",
    },
    uploaderReviewTotal > 0 && {
      label: `${uploaderReviewTotal} need uploader review (Assign)`,
      href: "/admin/assign?tab=uploader_review",
      tone: "warn",
    },
    verifiedRouting.rmQueue > 0 && {
      label: `${verifiedRouting.rmQueue} verified, unassigned`,
      href: "/admin/assign?tab=unassigned",
      tone: "default",
    },
    (data?.reverifyTasks ?? 0) > 0 && {
      label: `${data?.reverifyTasks} re-verify tasks open`,
      href: "/upload/leads?tab=review",
      tone: "danger",
    },
    staffTotals.overdue > 0 && {
      label: `${staffTotals.overdue} overdue uploader tasks`,
      href: "/upload/tasks",
      tone: "danger",
    },
  ].filter(Boolean) as Array<{ label: string; href: string; tone: string }>;

  function downloadExcel() {
    if (!data) return;
    downloadOverviewCsv("uploader-overview", buildUploaderOverviewSections(data));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Lead Uploader Overview</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-muted">
            Pipeline snapshot for verification, routing into Assign, and uploader review queues.
            Counts are live; period metrics use the date filter below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadExcel} disabled={!data || loading}>
            Download Excel
          </Button>
          <Link href="/upload/leads">
            <Button variant="secondary">Uploader workspace</Button>
          </Link>
          <Link href="/admin/assign">
            <Button>Assign leads</Button>
          </Link>
        </div>
      </div>

      <Card className="space-y-3">
        <OverviewDateRangeFilter
          values={dateRange}
          onChange={setDateRange}
          onApply={() => void load(dateRange)}
          onReset={() => {
            const next = defaultOverviewDateRange();
            setDateRange(next);
            void load(next);
          }}
        />
        <p className="text-xs text-slate-muted">
          Period activity for <span className="font-medium text-brand">{periodLabel}</span>.
          Pipeline counts below are current snapshots.
        </p>
      </Card>

      {attentionItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
            Needs attention
          </p>
          <ul className="flex flex-wrap gap-2">
            {attentionItems.map((item) => (
              <li key={item.label}>
                <Link href={item.href}>
                  <Badge
                    variant={
                      item.tone === "danger"
                        ? "critical"
                        : item.tone === "warn"
                          ? "hot"
                          : "default"
                    }
                    className="cursor-pointer hover:opacity-90"
                  >
                    {item.label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-brand">Lead pipeline</h2>
        <p className="mb-3 text-xs text-slate-muted">
          Left to right: uploader verifies → admin assigns → RM / Commission work → exits return for
          uploader review or close.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <PipelineStep
            label="Pending verify"
            value={tabs.pending}
            href="/upload/leads?tab=pending"
            sub="Uploader workspace"
          />
          <PipelineStep
            label="Verified pool"
            value={verifiedRouting.rmQueue + verifiedRouting.portal}
            href="/admin/assign?tab=unassigned"
            sub={`${verifiedRouting.rmQueue} RM · ${verifiedRouting.portal} portal`}
          />
          <PipelineStep
            label="With RM / Commission"
            value={verifiedRouting.assigned + verifiedRouting.commission}
            href="/admin/assign?tab=assigned"
            sub={`${verifiedRouting.assigned} RM · ${verifiedRouting.commission} commission`}
          />
          <PipelineStep
            label="Review"
            value={uploaderReviewTotal}
            href="/admin/assign?tab=uploader_review"
            sub="RM / Commission exits awaiting uploader"
            last
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-brand">Uploader workspace tabs</h2>
              <p className="text-xs text-slate-muted">Same counts as /upload/leads</p>
            </div>
            <Link href="/upload/leads" className="text-xs font-medium text-accent hover:underline">
              Open workspace
            </Link>
          </div>
          <div className="space-y-1.5">
            {(Object.keys(UPLOAD_TAB_LABELS) as Array<keyof typeof UPLOAD_TAB_LABELS>).map(
              (key) => (
                <MetricLink
                  key={key}
                  label={UPLOAD_TAB_LABELS[key]}
                  value={tabs[key]}
                  href={UPLOAD_TAB_HREFS[key]}
                  tone={
                    key === "pending"
                      ? tabs.pending >= 10
                        ? "danger"
                        : "warn"
                      : key === "review"
                        ? "danger"
                        : key === "verified"
                          ? "ok"
                          : "default"
                  }
                />
              ),
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-brand">Follow-ups & admin tools</h2>
              <p className="text-xs text-slate-muted">
                Action items outside the pipeline snapshot — not duplicated above
              </p>
            </div>
            <Link href="/admin/assign" className="text-xs font-medium text-accent hover:underline">
              Assign leads
            </Link>
          </div>
          <div className="space-y-1.5">
            <MetricLink
              label="Re-verify tasks open"
              value={data?.reverifyTasks ?? 0}
              href="/upload/leads?tab=review"
              hint="RM / Commission exits awaiting uploader"
              tone={(data?.reverifyTasks ?? 0) > 0 ? "danger" : "default"}
            />
            <MetricLink
              label="Pending feedback referrals"
              value={data?.pendingReferrals ?? 0}
              href="/admin/feedback-referrals"
              hint="Awaiting admin review"
              tone={(data?.pendingReferrals ?? 0) > 0 ? "warn" : "default"}
            />
            <MetricLink
              label="Review queue"
              value={tabs.review}
              href="/upload/leads?tab=review"
              hint="Re-verify or close in uploader workspace"
              tone={tabs.review > 0 ? "warn" : "default"}
            />
            <MetricLink
              label="Closed leads"
              value={tabs.closed}
              href="/upload/leads?tab=closed"
              hint="Reactivate if the bride returns"
              tone="muted"
            />
            <MetricLink
              label="Portal-only in verified pool"
              value={verifiedRouting.portal}
              href="/admin/assign?tab=unassigned"
              hint="Tagged portal — still in unassigned queue"
              tone={verifiedRouting.portal > 0 ? "default" : "muted"}
            />
            <Link
              href="/admin/uploader/leads"
              className="group flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-slate-50"
            >
              <div>
                <p className="text-xs font-medium text-brand">Full uploader leads report</p>
                <p className="text-[11px] text-slate-muted">Export and audit all uploaded leads</p>
              </div>
              <span className="text-xs font-medium text-accent group-hover:underline">Open →</span>
            </Link>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-brand">
          Period activity · {periodLabel}
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Added</TH>
                <TH>Verified</TH>
                <TH>Rejected at verify</TH>
                <TH>{LEAD_EXIT_LABELS.notAnswering}</TH>
                <TH>NI closed</TH>
                <TH>Deactivated</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD className="font-medium tabular-nums">{mtd.added}</TD>
                <TD className="font-medium tabular-nums text-emerald-700">{mtd.verified}</TD>
                <TD className="tabular-nums text-red-600">{mtd.rejected}</TD>
                <TD className="tabular-nums">{mtd.notAnswering}</TD>
                <TD className="tabular-nums">{mtd.niClosed}</TD>
                <TD className="tabular-nums text-slate-muted">{mtd.deactivated}</TD>
              </TR>
            </TBody>
          </Table>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-sm">
          <Link href="/admin/feedback-referrals" className="text-accent hover:underline">
            Pending feedback referrals:{" "}
            <span className="font-semibold text-brand">{data?.pendingReferrals ?? 0}</span>
          </Link>
          <Link href="/upload/leads?tab=review" className="text-accent hover:underline">
            Re-verify tasks:{" "}
            <span className="font-semibold text-brand">{data?.reverifyTasks ?? 0}</span>
          </Link>
          <Link href="/admin/uploader/leads" className="text-accent hover:underline">
            Full leads report →
          </Link>
        </div>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">Not verified queue</h2>
            <p className="text-xs text-slate-muted">Oldest pending verification first</p>
          </div>
          <Link href="/upload/leads?tab=pending">
            <Button size="sm" variant="secondary">
              Open pending tab
            </Button>
          </Link>
        </div>
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>Lead</TH>
                <TH>City</TH>
                <TH>Phone</TH>
                <TH>Source</TH>
                <TH>Waiting</TH>
                <TH>Added</TH>
              </TR>
            </THead>
            <TBody>
              {loading && !data ? (
                <TR>
                  <TD colSpan={6} className="text-center text-slate-muted">
                    Loading…
                  </TD>
                </TR>
              ) : (data?.pendingLeads ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-slate-muted">
                    No leads pending verification
                  </TD>
                </TR>
              ) : (
                (data?.pendingLeads ?? []).map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <p className="font-medium">{row.brideName}</p>
                      <p className="text-xs text-slate-muted">{row.displayId}</p>
                    </TD>
                    <TD>{row.city}</TD>
                    <TD className="text-sm">{row.phone}</TD>
                    <TD className="text-sm">{row.source ?? "—"}</TD>
                    <TD
                      className={cn(
                        row.daysWaiting >= 3 && "font-medium text-amber-700",
                        row.daysWaiting >= 7 && "text-red-600",
                      )}
                    >
                      {row.daysWaiting}d
                    </TD>
                    <TD className="text-sm text-slate-muted">{formatDate(row.createdAt)}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-brand">Team performance</h2>
          <p className="text-xs text-slate-muted">
            {periodLabel} — {staffTotals.added} added · {staffTotals.verified} verified ·{" "}
            {staffTotals.rejected} rejected · {staffTotals.overdue} overdue tasks
          </p>
        </div>

        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Added</TH>
                <TH>Verified</TH>
                <TH>Rejected</TH>
                <TH>Not ans.</TH>
                <TH>NI closed</TH>
                <TH>Deactivated</TH>
                <TH>Open</TH>
                <TH>Overdue</TH>
                <TH>Calls</TH>
                <TH>Talk min</TH>
              </TR>
            </THead>
            <TBody>
              {(data?.staff ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={11} className="text-center text-slate-muted">
                    No active lead uploaders
                  </TD>
                </TR>
              ) : (
                (data?.staff ?? []).map((row) => (
                  <TR key={row.staffId}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD>{row.addedMtd}</TD>
                    <TD>{row.verifiedMtd}</TD>
                    <TD className={row.rejectedMtd > 0 ? "text-red-600" : ""}>{row.rejectedMtd}</TD>
                    <TD>{row.notAnsweringMtd}</TD>
                    <TD>{row.niClosedMtd}</TD>
                    <TD>{row.deactivatedMtd}</TD>
                    <TD>{row.openTasks}</TD>
                    <TD className={cn(row.overdueTasks > 0 && "font-medium text-red-600")}>
                      {row.overdueTasks}
                    </TD>
                    <TD>{row.callsMtd}</TD>
                    <TD>{row.talkMinutesMtd}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
