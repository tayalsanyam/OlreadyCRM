"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { CallActivityReport } from "@/components/reports/CallActivityReport";
import type {
  FeedbackOutcomeRow,
  FeedbackOutcomesSummary,
  FeedbackReportScope,
} from "@/lib/feedback-report-types";
import { cn, formatDate } from "@/lib/utils";

type Tab = "outcomes" | "queue" | "calls";

type QueueStats = {
  toCall: number;
  noContact: number;
  followUpsDue: number;
  feedbacksThisMonth: number;
  referralsThisMonth: number;
  muaProspectsThisMonth: number;
  referralsConvertedThisMonth: number;
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-muted">{label}</p>
      <p className="text-2xl font-bold text-brand">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-muted">{sub}</p>}
    </div>
  );
}

function OutcomesTab({ adminMode = false }: { adminMode?: boolean }) {
  const [scope, setScope] = useState<FeedbackReportScope>(adminMode ? "team" : "mine");
  const [staffId, setStaffId] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<FeedbackOutcomesSummary | null>(null);
  const [rows, setRows] = useState<FeedbackOutcomeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const outcomesApi = adminMode
    ? "/api/admin/feedback/reports/outcomes"
    : "/api/feedback/reports/outcomes";

  useEffect(() => {
    if (!adminMode) return;
    void fetch("/api/admin/feedback/reports/staff")
      .then((r) => r.json())
      .then((j: { data?: { id: string; name: string }[] }) =>
        setStaffOptions(j.data ?? [])
      );
  }, [adminMode]);

  const load = useCallback(() => {
    if (adminMode && scope === "mine" && !staffId) {
      setSummary(null);
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ scope, month });
    if (adminMode && scope === "mine" && staffId) {
      params.set("staffId", staffId);
    }
    void fetch(`${outcomesApi}?${params}`)
      .then((r) => r.json())
      .then((j: { data?: { summary: FeedbackOutcomesSummary; rows: FeedbackOutcomeRow[] } }) => {
        setSummary(j.data?.summary ?? null);
        setRows(j.data?.rows ?? []);
        setLoading(false);
      });
  }, [scope, month, staffId, adminMode, outcomesApi]);

  useEffect(() => {
    load();
  }, [load]);

  const scopeLabel =
    adminMode && scope === "mine" && staffId
      ? staffOptions.find((s) => s.id === staffId)?.name ?? "Staff"
      : scope === "mine"
        ? "My"
        : "Team";

  const exportUrl = (() => {
    const params = new URLSearchParams({ scope, month, format: "csv" });
    if (adminMode && scope === "mine" && staffId) params.set("staffId", staffId);
    return `${outcomesApi}?${params}`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Scope</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["team", adminMode ? "All team" : "Team"],
                ["mine", adminMode ? "One feedback RM" : "My work"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium",
                  scope === id
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-slate-200 text-slate-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {adminMode && scope === "mine" && (
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Feedback RM</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="">Select…</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Month</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={adminMode && scope === "mine" && !staffId}
          onClick={() => window.open(exportUrl, "_blank")}
        >
          Export CSV
        </Button>
      </div>

      {adminMode && scope === "mine" && !staffId && (
        <p className="text-sm text-amber-800">Select a feedback RM to view their outcomes.</p>
      )}

      {loading || !summary || (adminMode && scope === "mine" && !staffId) ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`${scopeLabel} · Connected feedbacks`}
              value={summary.connectedFeedbacks}
            />
            <StatCard
              label="Sentiment"
              value={`${summary.positive}↑ ${summary.negative}↓`}
              sub={`${summary.mixed} mixed`}
            />
            <StatCard
              label="Avg Olready / MUA rating"
              value={
                summary.avgOlreadyRating != null || summary.avgMuaRating != null
                  ? `${summary.avgOlreadyRating ?? "—"} / ${summary.avgMuaRating ?? "—"}`
                  : "—"
              }
            />
            <StatCard
              label={`${scopeLabel} · Bride referrals`}
              value={summary.brideReferrals}
              sub={`${summary.referralsConverted} converted`}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Outside MUAs captured" value={summary.outsideMuas} />
            <StatCard label="Care tickets raised" value={summary.careTicketsRaised} />
            <StatCard
              label="Engage Olready again"
              value={`${summary.engageAgainYes} yes`}
              sub={`${summary.engageAgainMaybe} maybe · ${summary.engageAgainNo} no`}
            />
            <StatCard
              label="No contact / declined"
              value={`${summary.notAnswered} / ${summary.notInterested}`}
              sub="Did not answer · Won't give feedback"
            />
          </div>
        </>
      )}

      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Lead</TH>
            <TH>Bride</TH>
            <TH>Outcome</TH>
            <TH>Sentiment</TH>
            <TH>Ratings</TH>
            <TH>Logged by</TH>
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-slate-muted">
                Loading…
              </TD>
            </TR>
          ) : rows.length === 0 ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-slate-muted">
                No feedback logged in this period
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                <TD className="font-mono text-xs">
                  <Link
                    href={`/rm/leads/${r.leadId}`}
                    className="text-accent hover:underline"
                  >
                    {r.displayId}
                  </Link>
                </TD>
                <TD>{r.brideName}</TD>
                <TD>
                  <Badge variant="muted">{r.connectionStatus.replace(/_/g, " ")}</Badge>
                </TD>
                <TD>{r.serviceSentiment ?? "—"}</TD>
                <TD className="text-xs text-slate-muted">
                  {r.olreadyRating != null || r.muaRating != null
                    ? `O ${r.olreadyRating ?? "—"} · M ${r.muaRating ?? "—"}`
                    : "—"}
                </TD>
                <TD className="text-xs">{r.submittedByName ?? "—"}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}

function QueueTab({ adminMode = false }: { adminMode?: boolean }) {
  const [stats, setStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    const url = adminMode
      ? "/api/admin/feedback/reports/queue"
      : "/api/feedback/stats";
    void fetch(url)
      .then((r) => r.json())
      .then((j: { data: QueueStats }) => setStats(j.data ?? null));
  }, [adminMode]);

  if (!stats) {
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100" />;
  }

  const prefix = adminMode ? "Team" : "My";

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-muted">
        {adminMode
          ? "Team-wide queue and monthly totals across all feedback RMs."
          : "Live queue snapshot — same counts as the feedback workspace. Team pool is shared; follow-ups and monthly captures are yours."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Team · To call" value={stats.toCall} />
        <StatCard label="Team · No contact" value={stats.noContact} />
        <StatCard
          label={`${prefix} · Follow-ups due`}
          value={stats.followUpsDue}
        />
        <StatCard
          label={`${prefix} · Feedbacks (month)`}
          value={stats.feedbacksThisMonth}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={`${prefix} · Bride referrals (month)`}
          value={stats.referralsThisMonth}
        />
        <StatCard
          label={`${prefix} · Outside MUAs (month)`}
          value={stats.muaProspectsThisMonth}
        />
        <StatCard
          label={`${prefix} · Referrals converted`}
          value={stats.referralsConvertedThisMonth}
        />
      </div>
      {!adminMode && (
        <Link href="/feedback/queue" className="text-sm text-accent hover:underline">
          Open feedback queue →
        </Link>
      )}
    </div>
  );
}

const FEEDBACK_TABS: { id: Tab; label: string }[] = [
  { id: "outcomes", label: "Feedback outcomes" },
  { id: "queue", label: "Team · Queue" },
  { id: "calls", label: "My · Call activity" },
];

const ADMIN_TABS: { id: Tab; label: string }[] = [
  { id: "outcomes", label: "Feedback outcomes" },
  { id: "queue", label: "Team · Queue" },
  { id: "calls", label: "Call activity" },
];

export function FeedbackReportsPage({ adminMode = false }: { adminMode?: boolean }) {
  const [tab, setTab] = useState<Tab>("outcomes");
  const TABS = adminMode ? ADMIN_TABS : FEEDBACK_TABS;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-brand">
          {adminMode ? "Post-Event Feedback Reports" : "Reports"}
        </h1>
        <p className="text-sm text-slate-muted">
          {adminMode
            ? "Team outcomes, queue health, and Callyzer activity for feedback RMs — view and export."
            : "Post-event calling — outcomes you logged, team queue health, and your Callyzer activity."}
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-slate-muted hover:text-brand"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "outcomes" && <OutcomesTab adminMode={adminMode} />}
      {tab === "queue" && <QueueTab adminMode={adminMode} />}
      {tab === "calls" && (
        <CallActivityReport
          apiBase={adminMode ? "/api/admin/reports" : "/api/reports"}
          adminMode={adminMode}
        />
      )}
    </div>
  );
}
