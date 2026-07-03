"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { buildFeedbackOverviewSections } from "@/lib/feedback-overview-export";
import { downloadOverviewCsv } from "@/lib/download-overview-csv";
import type { AdminFeedbackOverview } from "@/lib/admin-feedback-overview-query";
import { OverviewDateRangeFilter } from "@/components/admin/OverviewDateRangeFilter";
import {
  buildOverviewDateQuery,
  defaultOverviewDateRange,
  overviewDateRangeLabel,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import { cn, formatDate } from "@/lib/utils";

function sentimentBadge(status: string, sentiment: string | null) {
  if (status === "connected" && sentiment === "positive") {
    return <Badge variant="success">Positive</Badge>;
  }
  if (status === "connected" && sentiment === "negative") {
    return <Badge variant="critical">Negative</Badge>;
  }
  if (status === "connected" && sentiment === "mixed") {
    return <Badge variant="hot">Mixed</Badge>;
  }
  if (status === "not_answered") {
    return <Badge variant="muted">Not answered</Badge>;
  }
  if (status === "not_interested") {
    return <Badge variant="muted">Not interested</Badge>;
  }
  if (status === "closed_no_contact") {
    return <Badge variant="muted">No contact</Badge>;
  }
  return <Badge>{status.replace(/_/g, " ")}</Badge>;
}

function bookedWithLabel(row: {
  muaType: string;
  olreadyMuaName: string | null;
  nonOlreadyMuaName: string | null;
}): string {
  if (row.muaType === "non_olready") {
    return row.nonOlreadyMuaName?.trim() || "Outside MUA";
  }
  return row.olreadyMuaName?.trim() || "Olready MUA";
}

function truncate(text: string | null | undefined, max = 72): string {
  if (!text?.trim()) return "—";
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function LeadLink({
  leadId,
  displayId,
  brideName,
}: {
  leadId: string;
  displayId: string;
  brideName: string;
}) {
  return (
    <Link href={`/rm/leads/${leadId}`} className="group block">
      <p className="font-medium text-brand group-hover:text-accent">{brideName}</p>
      <p className="text-xs text-slate-muted group-hover:underline">{displayId}</p>
    </Link>
  );
}

function feedbackLogHref(range: OverviewDateRange): string {
  const params = new URLSearchParams();
  params.set("fromDate", range.dateFrom);
  params.set("toDate", range.dateTo);
  return `/admin/feedback?${params.toString()}`;
}

export default function AdminFeedbackOverviewPage() {
  const [data, setData] = useState<AdminFeedbackOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<OverviewDateRange>(defaultOverviewDateRange);

  const load = useCallback(async (range: OverviewDateRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/feedback/overview?${buildOverviewDateQuery(range)}`);
      const json = await res.json();
      setData(json.data ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(defaultOverviewDateRange());
  }, [load]);

  const queue = data?.queue ?? {
    toCall: 0,
    noContact: 0,
    followUpsDue: 0,
    feedbacksThisMonth: 0,
    referralsThisMonth: 0,
    muaProspectsThisMonth: 0,
    referralsConvertedThisMonth: 0,
    openFollowUps: 0,
    eligibleLeads: 0,
  };

  const outcomes = data?.outcomes ?? {
    connectedFeedbacks: 0,
    positive: 0,
    negative: 0,
    mixed: 0,
    notAnswered: 0,
    notInterested: 0,
    avgOlreadyRating: null,
    avgMuaRating: null,
    brideReferrals: 0,
    referralsConverted: 0,
    outsideMuas: 0,
    careTicketsRaised: 0,
    engageAgainYes: 0,
    engageAgainMaybe: 0,
    engageAgainNo: 0,
  };

  const period = data?.period ?? {
    feedbacks: 0,
    referrals: 0,
    muaProspects: 0,
    referralsConverted: 0,
    feedbackMuaBookings: 0,
  };

  const referrals = data?.referrals ?? {
    pending: 0,
    pickedUp: 0,
    converted: 0,
    dismissed: 0,
  };

  const activeRange = data?.dateRange ?? dateRange;
  const periodLabel = overviewDateRangeLabel(activeRange);

  const staffTotals = useMemo(() => {
    const rows = data?.staff ?? [];
    return {
      feedbacks: rows.reduce((n, s) => n + s.feedbacksMtd, 0),
      referrals: rows.reduce((n, s) => n + s.referralsMtd, 0),
      notAnswered: rows.reduce((n, s) => n + s.notAnsweredMtd, 0),
      overdue: rows.reduce((n, s) => n + s.overdueTasks, 0),
    };
  }, [data]);

  const outcomeRows = useMemo(() => {
    const connected = Math.max(outcomes.connectedFeedbacks, 1);
    return [
      { label: "Connected calls", count: outcomes.connectedFeedbacks, pct: null },
      { label: "Positive", count: outcomes.positive, pct: (outcomes.positive / connected) * 100 },
      { label: "Negative", count: outcomes.negative, pct: (outcomes.negative / connected) * 100 },
      { label: "Mixed", count: outcomes.mixed, pct: (outcomes.mixed / connected) * 100 },
      { label: "Not answered (attempts)", count: outcomes.notAnswered, pct: null },
      { label: "Declined feedback", count: outcomes.notInterested, pct: null },
      { label: "Outside MUAs captured", count: outcomes.outsideMuas, pct: null },
      { label: "Care tickets raised", count: outcomes.careTicketsRaised, pct: null },
    ].filter((r) => r.count > 0 || r.label.startsWith("Connected"));
  }, [outcomes]);

  function downloadExcel() {
    if (!data) return;
    downloadOverviewCsv("feedback-overview", buildFeedbackOverviewSections(data));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Feedback Overview</h1>
          <p className="text-sm text-slate-muted">
            See who needs a call, what was captured this period, and drill into leads — not just
            totals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadExcel} disabled={!data || loading}>
            Download Excel
          </Button>
          <Link href={feedbackLogHref(activeRange)}>
            <Button variant="secondary">Full feedback log</Button>
          </Link>
          <Link href="/admin/leads/expired">
            <Button variant="secondary">Expired leads</Button>
          </Link>
          <Link href="/admin/feedback-referrals">
            <Button variant="secondary">Referral intake</Button>
          </Link>
        </div>
      </div>

      <Card>
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
        <p className="mt-2 text-xs text-slate-muted">
          Period tables use <span className="font-medium text-brand">{periodLabel}</span>. Queue
          sections below are live snapshots.
        </p>
      </Card>

      <section id="queue">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">What needs attention now</h2>
            <p className="text-xs text-slate-muted">
              {queue.eligibleLeads} post-event leads eligible · {queue.openFollowUps} open
              follow-up tasks
            </p>
          </div>
          <Link href="/admin/leads/expired" className="text-sm text-accent hover:underline">
            Open expired leads list →
          </Link>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className={cn(queue.toCall > 0 && "border-amber-200 ring-1 ring-amber-100")}>
            <p className="text-xs text-slate-muted">Waiting for first call</p>
            <p className="text-2xl font-bold text-brand">{queue.toCall}</p>
          </Card>
          <Card className={cn(queue.followUpsDue > 0 && "border-red-200 ring-1 ring-red-100")}>
            <p className="text-xs text-slate-muted">Follow-ups due / overdue</p>
            <p className="text-2xl font-bold text-red-600">{queue.followUpsDue}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-muted">Closed — no contact</p>
            <p className="text-2xl font-bold text-amber-700">{queue.noContact}</p>
          </Card>
          <Card className={cn(referrals.pending > 0 && "border-amber-200 ring-1 ring-amber-100")}>
            <p className="text-xs text-slate-muted">Referrals awaiting pickup</p>
            <p className="text-2xl font-bold text-brand">{referrals.pending}</p>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <QueueTable
            title="Leads waiting for first call"
            subtitle={`Showing ${Math.min(data?.queueToCall.length ?? 0, 15)} of ${queue.toCall}`}
            empty="No leads waiting — queue is clear"
            loading={loading && !data}
            rows={data?.queueToCall ?? []}
          />
          <FollowUpTable
            loading={loading && !data}
            rows={data?.followUpsDue ?? []}
            total={queue.followUpsDue}
          />
        </div>

        {(data?.queueNoContact.length ?? 0) > 0 && (
          <div className="mt-6">
            <QueueTable
              title="Closed — no contact"
              subtitle={`Sample of ${queue.noContact} leads closed after max attempts`}
              empty=""
              loading={false}
              rows={data?.queueNoContact ?? []}
              showAttempts
            />
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">This period · {periodLabel}</h2>
            <p className="text-xs text-slate-muted">
              {period.feedbacks} connected feedbacks · {period.feedbackMuaBookings} MUA bookings
              captured · {period.referrals} bride referrals · {period.muaProspects} outside MUA
              prospects
            </p>
          </div>
          <Link href={feedbackLogHref(activeRange)} className="text-sm text-accent hover:underline">
            View all in feedback log →
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-x-auto p-0">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-brand">Outcome breakdown</h3>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Outcome</TH>
                  <TH>Count</TH>
                  <TH>Share</TH>
                </TR>
              </THead>
              <TBody>
                {outcomeRows.map((row) => (
                  <TR key={row.label}>
                    <TD>{row.label}</TD>
                    <TD className="tabular-nums font-medium">{row.count}</TD>
                    <TD className="text-sm text-slate-muted">
                      {row.pct != null ? `${row.pct.toFixed(0)}% of connected` : "—"}
                    </TD>
                  </TR>
                ))}
                <TR>
                  <TD>Avg rating (Olready / MUA)</TD>
                  <TD colSpan={2} className="text-sm">
                    {outcomes.avgOlreadyRating != null
                      ? outcomes.avgOlreadyRating.toFixed(1)
                      : "—"}
                    {" · "}
                    {outcomes.avgMuaRating != null ? outcomes.avgMuaRating.toFixed(1) : "—"}
                  </TD>
                </TR>
                <TR>
                  <TD>Engage Olready again</TD>
                  <TD colSpan={2} className="text-sm">
                    Yes {outcomes.engageAgainYes} · Maybe {outcomes.engageAgainMaybe} · No{" "}
                    {outcomes.engageAgainNo}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </Card>

          <Card className="overflow-x-auto p-0">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-brand">MUA bookings via feedback</h3>
                  <p className="text-xs text-slate-muted">
                    Connected Olready MUAs with portal push — no formal RM booking
                  </p>
                </div>
                <Link
                  href={`/admin/bookings?selfBooking=yes&fromDate=${activeRange.dateFrom}&toDate=${activeRange.dateTo}`}
                  className="text-xs text-accent hover:underline"
                >
                  Admin bookings →
                </Link>
              </div>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Lead</TH>
                  <TH>MUA</TH>
                  <TH>Event</TH>
                  <TH>Captured</TH>
                  <TH>By</TH>
                </TR>
              </THead>
              <TBody>
                {(data?.feedbackMuaBookings ?? []).length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-6 text-center text-slate-muted">
                      No feedback-captured MUA bookings in this period
                    </TD>
                  </TR>
                ) : (
                  (data?.feedbackMuaBookings ?? []).map((row) => (
                    <TR key={row.feedbackId}>
                      <TD>
                        <LeadLink
                          leadId={row.leadId}
                          displayId={row.displayId}
                          brideName={row.brideName}
                        />
                      </TD>
                      <TD>
                        <Link
                          href={`/admin/muas/${row.muaId}`}
                          className="text-sm font-medium text-brand hover:text-accent"
                        >
                          {row.muaName}
                        </Link>
                        {row.muaDisplayId && (
                          <p className="text-xs text-slate-muted">{row.muaDisplayId}</p>
                        )}
                      </TD>
                      <TD className="text-sm">
                        {row.ceremonyType ?? "—"}
                        {row.eventDate && (
                          <p className="text-xs text-slate-muted">{formatDate(row.eventDate)}</p>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-sm text-slate-muted">
                        {formatDate(row.capturedAt)}
                      </TD>
                      <TD className="text-sm">{row.submittedByName ?? "—"}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">Recent feedback · {periodLabel}</h2>
            <p className="text-xs text-slate-muted">
              Every submission in range — click a lead for full notes and history
            </p>
          </div>
        </div>
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>Lead</TH>
                <TH>Date</TH>
                <TH>Outcome</TH>
                <TH>Booked with</TH>
                <TH>Ratings</TH>
                <TH>Note</TH>
                <TH>By</TH>
              </TR>
            </THead>
            <TBody>
              {loading && !data ? (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-slate-muted">
                    Loading…
                  </TD>
                </TR>
              ) : (data?.recentFeedbacks ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-slate-muted">
                    No feedback submissions in this period
                  </TD>
                </TR>
              ) : (
                (data?.recentFeedbacks ?? []).map((row) => (
                  <TR key={row.id} className="align-top">
                    <TD>
                      <LeadLink
                        leadId={row.leadId}
                        displayId={row.displayId}
                        brideName={row.brideName}
                      />
                    </TD>
                    <TD className="whitespace-nowrap text-sm text-slate-muted">
                      {formatDate(row.createdAt)}
                    </TD>
                    <TD>{sentimentBadge(row.connectionStatus, row.serviceSentiment)}</TD>
                    <TD className="max-w-[140px] text-sm">{bookedWithLabel(row)}</TD>
                    <TD className="whitespace-nowrap text-sm tabular-nums">
                      {row.connectionStatus === "connected" ? (
                        <>
                          {row.olreadyRating ?? "—"} / {row.muaRating ?? "—"}
                        </>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="max-w-xs text-sm text-slate-muted">
                      {truncate(row.noteSnippet)}
                    </TD>
                    <TD className="text-sm">{row.submittedByName ?? "—"}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">Pending referral intake</h2>
            <p className="text-xs text-slate-muted">Waiting for uploader to pick up</p>
          </div>
          <Link href="/admin/feedback-referrals" className="text-sm text-accent hover:underline">
            Open referral queue →
          </Link>
        </div>
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>Referral</TH>
                <TH>Source lead</TH>
                <TH>Captured by</TH>
                <TH>Added</TH>
              </TR>
            </THead>
            <TBody>
              {(data?.pendingReferrals ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={4} className="py-8 text-center text-slate-muted">
                    No pending referrals
                  </TD>
                </TR>
              ) : (
                (data?.pendingReferrals ?? []).map((row) => (
                  <TR key={`${row.kind}-${row.id}`}>
                    <TD>
                      <div className="flex items-start gap-2">
                        <Badge
                          className={
                            row.kind === "bride"
                              ? "bg-sky-100 text-sky-900"
                              : "bg-violet-100 text-violet-900"
                          }
                        >
                          {row.kind === "bride" ? "Bride" : "MUA"}
                        </Badge>
                        <div>
                          <p className="font-medium">{row.referralName}</p>
                          <p className="text-xs text-slate-muted">{row.referralPhone ?? "—"}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <LeadLink
                        leadId={row.sourceLeadId}
                        displayId={row.sourceLeadDisplayId}
                        brideName={row.sourceLeadName}
                      />
                    </TD>
                    <TD className="text-sm">{row.capturedByName ?? "—"}</TD>
                    <TD className="text-sm text-slate-muted">{formatDate(row.createdAt)}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-brand">Team performance · {periodLabel}</h2>
          <p className="text-xs text-slate-muted">
            {staffTotals.feedbacks} connected feedbacks · {staffTotals.referrals} referrals ·{" "}
            {staffTotals.notAnswered} not-answered attempts · {staffTotals.overdue} overdue tasks
          </p>
        </div>

        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Connected</TH>
                <TH>Referrals</TH>
                <TH>Not answered</TH>
                <TH>Declined</TH>
                <TH>MUA prospects</TH>
                <TH>Open tasks</TH>
                <TH>Due today+</TH>
                <TH>Overdue</TH>
                <TH>Calls</TH>
                <TH>Talk (min)</TH>
              </TR>
            </THead>
            <TBody>
              {(data?.staff ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={11} className="py-8 text-center text-slate-muted">
                    No active feedback RMs
                  </TD>
                </TR>
              ) : (
                (data?.staff ?? []).map((row) => (
                  <TR key={row.staffId}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="tabular-nums">{row.feedbacksMtd}</TD>
                    <TD className="tabular-nums">{row.referralsMtd}</TD>
                    <TD className="tabular-nums">{row.notAnsweredMtd}</TD>
                    <TD className="tabular-nums">{row.notInterestedMtd}</TD>
                    <TD className="tabular-nums">{row.muaProspectsMtd}</TD>
                    <TD className="tabular-nums">{row.openTasks}</TD>
                    <TD className={cn("tabular-nums", row.followUpsDue > 0 && "text-amber-600")}>
                      {row.followUpsDue}
                    </TD>
                    <TD className={cn("tabular-nums", row.overdueTasks > 0 && "font-medium text-red-600")}>
                      {row.overdueTasks}
                    </TD>
                    <TD className="tabular-nums">{row.callsMtd}</TD>
                    <TD className="tabular-nums">{row.talkMinutesMtd}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

function QueueTable({
  title,
  subtitle,
  empty,
  loading,
  rows,
  showAttempts = true,
}: {
  title: string;
  subtitle: string;
  empty: string;
  loading: boolean;
  rows: AdminFeedbackOverview["queueToCall"];
  showAttempts?: boolean;
}) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-brand">{title}</h3>
        <p className="text-xs text-slate-muted">{subtitle}</p>
      </div>
      <Card className="overflow-x-auto p-0">
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Location</TH>
              {showAttempts && <TH>Attempts</TH>}
              <TH>Last try</TH>
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD colSpan={showAttempts ? 4 : 3} className="py-6 text-center text-slate-muted">
                  Loading…
                </TD>
              </TR>
            ) : rows.length === 0 ? (
              <TR>
                <TD colSpan={showAttempts ? 4 : 3} className="py-6 text-center text-slate-muted">
                  {empty}
                </TD>
              </TR>
            ) : (
              rows.map((row) => (
                <TR key={row.leadId}>
                  <TD>
                    <LeadLink
                      leadId={row.leadId}
                      displayId={row.displayId}
                      brideName={row.brideName}
                    />
                  </TD>
                  <TD className="text-sm">{row.eventCity ?? row.city ?? "—"}</TD>
                  {showAttempts && (
                    <TD className="text-sm tabular-nums">
                      {row.attemptCount}
                      {row.unreachableAttemptCount > 0 && (
                        <span className="text-slate-muted"> ({row.unreachableAttemptCount} no ans.)</span>
                      )}
                    </TD>
                  )}
                  <TD className="text-sm text-slate-muted">
                    {row.lastFeedbackAt ? formatDate(row.lastFeedbackAt) : "Never"}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function FollowUpTable({
  loading,
  rows,
  total,
}: {
  loading: boolean;
  rows: AdminFeedbackOverview["followUpsDue"];
  total: number;
}) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-brand">Follow-ups due or overdue</h3>
        <p className="text-xs text-slate-muted">
          Showing {rows.length} of {total} tasks due today or earlier
        </p>
      </div>
      <Card className="overflow-x-auto p-0">
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Assigned to</TH>
              <TH>Due</TH>
              <TH>Task</TH>
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD colSpan={4} className="py-6 text-center text-slate-muted">
                  Loading…
                </TD>
              </TR>
            ) : rows.length === 0 ? (
              <TR>
                <TD colSpan={4} className="py-6 text-center text-slate-muted">
                  No follow-ups due
                </TD>
              </TR>
            ) : (
              rows.map((row) => (
                <TR key={row.taskId}>
                  <TD>
                    <LeadLink
                      leadId={row.leadId}
                      displayId={row.displayId}
                      brideName={row.brideName}
                    />
                  </TD>
                  <TD className="text-sm">{row.staffName}</TD>
                  <TD className="text-sm">
                    <span className={cn(row.overdue && "font-medium text-red-600")}>
                      {formatDate(row.dueDate)}
                    </span>
                    {row.overdue && (
                      <Badge variant="critical" className="ml-2">
                        Overdue
                      </Badge>
                    )}
                  </TD>
                  <TD className="max-w-[160px] truncate text-sm text-slate-muted" title={row.taskTitle}>
                    {row.taskTitle}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
