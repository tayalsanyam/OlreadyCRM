"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";

const INITIAL_COLLAPSE = 5;

function CollapsibleList<T>({
  items,
  renderItem,
  emptyMessage,
  moreLink,
  moreLabel,
  initialCount = INITIAL_COLLAPSE,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  moreLink?: string;
  moreLabel?: string;
  initialCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initialCount);
  const hasMore = items.length > initialCount;

  if (items.length === 0) {
    return <p className="text-slate-500 text-sm py-2">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-1">
      {visible.map((item, i) => (
        <div key={i}>{renderItem(item)}</div>
      ))}
      {hasMore && !expanded && (
        <button onClick={() => setExpanded(true)} className="text-slate-400 hover:text-sky-400 text-sm">
          +{items.length - initialCount} more
        </button>
      )}
      {moreLink && items.length > 0 && (
        <Link href={moreLink} className="block text-sky-400 hover:underline text-sm mt-1">
          {moreLabel ?? "View all →"}
        </Link>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtext,
  color = "text-white",
  title,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  color?: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-700/40 border border-slate-600/60 p-4" title={title}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
    </div>
  );
}

function ProgressBar({ percent, color = "bg-sky-500" }: { percent: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const { data, error } = useSWR(`/api/dashboard?month=${month}`, fetcher, { refreshInterval: 5000 });
  const { data: expiringSoon = [] } = useSWR("/api/customers?expiring_soon=true", fetcher, { refreshInterval: 10000 });

  const prevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  if (error) return <div className="text-red-400 p-4">Failed to load</div>;
  if (!data) return <div className="text-slate-400 p-4">Loading...</div>;

  const tr = data.targetRevenue;
  const conversion = (data.totalLeads ?? 0) > 0
    ? Math.round(((data.byStatus?.PAID ?? 0) / data.totalLeads) * 100)
    : 0;
  const targetPercent = tr?.totalTarget ? Math.round(((tr.totalPaid ?? 0) / tr.totalTarget) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">📊 Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="btn-ghost text-slate-400 hover:text-white p-1" aria-label="Previous month">←</button>
          <label className="text-sm text-slate-400">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input text-sm py-1.5 w-40"
          />
          <button onClick={nextMonth} className="btn-ghost text-slate-400 hover:text-white p-1" aria-label="Next month">→</button>
          <span className="text-xs text-slate-500" title="Auto-refresh every 5s">⟳</span>
        </div>
      </div>

      {/* Executive Summary - KPI cards */}
      <div className="card bg-slate-800/80">
        <h2 className="mb-4 text-sm font-semibold text-slate-300 flex items-center gap-2">
          <span>📊</span> Executive Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <KpiCard icon="💰" label="Received (this month)" value={`₹${(data.revenue ?? 0).toLocaleString()}`} color="text-emerald-400" title="Revenue received this month" />
          <KpiCard icon="📈" label="Expected (this month)" value={`₹${(data.expectedRevenue ?? 0).toLocaleString()}`} color="text-sky-400" title="Expected from CONFIRMED/PARTLY_PAID" />
          <KpiCard icon="⏳" label="Pending (this month)" value={`₹${(data.pending ?? 0).toLocaleString()}`} color="text-amber-400" title="Balance due this month" />
          <KpiCard icon="🔄" label="Pending (from previous)" value={`₹${(data.pendingFromPrevious ?? 0).toLocaleString()}`} color="text-amber-300" title="Carried over from earlier months" />
          <KpiCard
            icon="🎯"
            label="Conversion"
            value={`${conversion}%`}
            subtext={<ProgressBar percent={conversion} color="bg-emerald-500" />}
            title="PAID leads / Total leads"
          />
          <KpiCard icon="👥" label="Total Leads" value={data.totalLeads ?? 0} title="All leads in pipeline" />
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <span>✓</span> Tasks Pending
            </p>
            <p className="text-lg font-bold text-amber-400">
              {data.taskCount ?? 0}
              {(data.overdueCount ?? 0) > 0 && (
                <span className="ml-2 text-sm font-normal text-red-400">({data.overdueCount} overdue)</span>
              )}
            </p>
          </div>
          <Link href="/tasks" className="btn-secondary text-sm">View Tasks</Link>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/leads" className="btn-primary">View Leads</Link>
        <Link href="/pipeline" className="btn-secondary">Pipeline</Link>
        <Link href="/tasks" className="btn-secondary">Tasks</Link>
        <Link href="/payments" className="btn-secondary">Payments</Link>
        <Link href="/customers" className="btn-secondary">Customers</Link>
      </div>

      {/* Expiring Soon - always show with empty state */}
      <div className={`card ${(expiringSoon as unknown[]).length > 0 ? "border-amber-500/30" : ""}`}>
        <h2 className="mb-2 font-semibold text-amber-400 flex items-center gap-2">
          <span>⏰</span> Subscriptions Expiring Soon (30 days)
        </h2>
        <p className="mb-3 text-sm text-slate-400">Customers whose plan ends in the next 30 days</p>
        <CollapsibleList
          items={(expiringSoon as { id: string; name: string; lead_id: string; plan_end_date?: string }[]) || []}
          renderItem={(c) => (
            <Link href={`/leads/${c.lead_id}`} className="block text-sky-400 hover:underline text-sm">
              {c.name} · expires {c.plan_end_date || "-"}
            </Link>
          )}
          emptyMessage="✓ All clear — no subscriptions expiring in the next 30 days"
          moreLink="/customers?expiring_soon=true"
          moreLabel="View all customers →"
          initialCount={5}
        />
      </div>

      {/* Payment Overdue - always show */}
      <div className={`card ${(data.paymentOverdue?.length ?? 0) > 0 ? "border-red-500/30" : ""}`}>
        <h2 className="mb-2 font-semibold flex items-center gap-2">
          <span>⚠️</span> Payment Overdue
          {(data.paymentOverdue?.length ?? 0) > 0 && (
            <span className="badge bg-red-600/80 text-white">{(data.paymentOverdue?.length ?? 0)}</span>
          )}
        </h2>
        <p className="mb-3 text-sm text-slate-400">Pending payments past committed_date</p>
        <CollapsibleList
          items={data.paymentOverdue ?? []}
          renderItem={(l: { id: string; name: string; bdm: string }) => (
            <Link href={`/leads/${l.id}`} className="block text-sky-400 hover:underline text-sm">
              {l.name} ({l.bdm})
            </Link>
          )}
          emptyMessage="✓ All clear — no overdue payments"
          moreLink="/payments?overdue=true"
          moreLabel="View Payment Pending →"
          initialCount={5}
        />
      </div>

      {/* Renewals Needing Attention */}
      {(data.renewalDealsNeedingAttention?.length ?? 0) > 0 && (
        <div className="card border-sky-500/30">
          <h2 className="mb-2 font-semibold text-sky-400 flex items-center gap-2">
            <span>🔄</span> Renewals Needing Attention
            <span className="badge bg-sky-600/80 text-white">{data.renewalDealsNeedingAttention?.length ?? 0}</span>
          </h2>
          <p className="mb-3 text-sm text-slate-400">RENEWAL_FOLLOW_UP deals requiring follow-up</p>
          <CollapsibleList
            items={data.renewalDealsNeedingAttention ?? []}
            renderItem={(d: { id: string; lead_id: string; lead_name: string; plan_name: string; next_follow_up?: string }) => (
              <Link href={`/leads/${d.lead_id}`} className="block text-sky-400 hover:underline text-sm">
                {d.lead_name} · {d.plan_name} · {d.next_follow_up || "—"}
              </Link>
            )}
            emptyMessage=""
            moreLink="/customers"
            initialCount={5}
          />
        </div>
      )}

      {/* Deals in Final Stage - always show */}
      <div className="card">
        <h2 className="mb-2 font-semibold text-white flex items-center gap-2">
          <span>📋</span> Deals in Final Stage (CONFIRMED with committed_date)
          {(data.dealsInFinalStage?.length ?? 0) > 0 && (
            <span className="badge bg-slate-600 text-white">{(data.dealsInFinalStage?.length ?? 0)}</span>
          )}
        </h2>
        <CollapsibleList
          items={data.dealsInFinalStage ?? []}
          renderItem={(l: { id: string; name: string; bdm: string; committed_date?: string }) => (
            <Link href={`/leads/${l.id}`} className="block text-sm text-sky-400 hover:underline">
              {l.name} · {l.bdm} · {l.committed_date || ""}
            </Link>
          )}
          emptyMessage="No deals in final stage"
          moreLink="/payments"
          moreLabel="View Payment Pending →"
          initialCount={8}
        />
      </div>

      {/* Follow-up Tasks */}
      <div className="card">
        <h2 className="mb-2 font-semibold text-white flex items-center gap-2">
          <span>📌</span> Follow-up Tasks
        </h2>
        <p className="mb-3 text-sm text-slate-400">From next_follow_up dates: Overdue → Today → Upcoming</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-medium flex items-center gap-2">
              <span className="text-red-400">●</span> Overdue
              <span className="badge bg-red-600/50 text-red-200">{(data.followUpTasks?.overdue?.length ?? 0)}</span>
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {(data.followUpTasks?.overdue ?? []).slice(0, 5).map((t: { id: string; title: string; due: string; assignee: string; lead_id?: string; lead_name?: string }) => (
                <Link key={t.id} href={t.lead_id ? `/leads/${t.lead_id}` : "/tasks"} className="block text-sm text-slate-300 hover:text-white">
                  {t.lead_name ?? t.title} · {t.due}
                </Link>
              ))}
              {(data.followUpTasks?.overdue?.length ?? 0) > 5 && (
                <Link href="/tasks" className="text-slate-400 text-sm">+{(data.followUpTasks?.overdue?.length ?? 0) - 5} more →</Link>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium flex items-center gap-2">
              <span className="text-amber-400">●</span> Today
              <span className="badge bg-amber-600/50 text-amber-200">{(data.followUpTasks?.today?.length ?? 0)}</span>
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {(data.followUpTasks?.today ?? []).slice(0, 5).map((t: { id: string; title: string; due: string; assignee: string; lead_id?: string; lead_name?: string }) => (
                <Link key={t.id} href={t.lead_id ? `/leads/${t.lead_id}` : "/tasks"} className="block text-sm text-slate-300 hover:text-white">
                  {t.lead_name ?? t.title} · {t.assignee}
                </Link>
              ))}
              {(data.followUpTasks?.today?.length ?? 0) > 5 && (
                <Link href="/tasks" className="text-slate-400 text-sm">+{(data.followUpTasks?.today?.length ?? 0) - 5} more →</Link>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium flex items-center gap-2">
              <span className="text-slate-400">●</span> Upcoming
              <span className="badge bg-slate-600/50 text-slate-300">{(data.followUpTasks?.upcoming?.length ?? 0)}</span>
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {(data.followUpTasks?.upcoming ?? []).slice(0, 5).map((t: { id: string; title: string; due: string; assignee: string; lead_id?: string; lead_name?: string }) => (
                <Link key={t.id} href={t.lead_id ? `/leads/${t.lead_id}` : "/tasks"} className="block text-sm text-slate-300 hover:text-white">
                  {t.lead_name ?? t.title} · {t.due}
                </Link>
              ))}
              {(data.followUpTasks?.upcoming?.length ?? 0) > 5 && (
                <Link href="/tasks" className="text-slate-400 text-sm">+{(data.followUpTasks?.upcoming?.length ?? 0) - 5} more →</Link>
              )}
            </div>
          </div>
        </div>
        <Link href="/tasks" className="mt-3 inline-block text-sm text-sky-400 hover:underline">View all tasks →</Link>
      </div>

      {/* Today's Action + Pending Tasks */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold text-white flex items-center gap-2">
            <span>🔥</span> Today&apos;s Action
          </h2>
          <p className="mb-3 text-sm text-slate-400">Follow-ups today + tasks due today</p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {(data.todaysFollowUps ?? []).map((l: { id: string; name: string }) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="block text-sm text-sky-400 hover:underline">
                Follow up: {l.name}
              </Link>
            ))}
            {(data.todaysTasks ?? []).map((t: { id: string; title: string; lead_id?: string }) => (
              <Link key={t.id} href={t.lead_id ? `/leads/${t.lead_id}` : "/tasks"} className="block text-sm text-slate-300 hover:underline">
                Task: {t.title}
              </Link>
            ))}
            {(data.todaysFollowUps?.length ?? 0) === 0 && (data.todaysTasks?.length ?? 0) === 0 && (
              <p className="text-slate-500 text-sm">✓ No follow-ups or tasks due today</p>
            )}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold text-white flex items-center gap-2">
            <span>✓</span> Pending Tasks (non-follow-up)
          </h2>
          <p className="mb-3 text-sm text-slate-400">General tasks: overdue + due soon</p>
          <CollapsibleList
            items={data.pendingTasksNonFollowUp ?? []}
            renderItem={(t: { id: string; title: string; due: string }) => (
              <Link href="/tasks" className="block text-sm text-slate-300 hover:underline">
                {t.title} · {t.due}
              </Link>
            )}
            emptyMessage="✓ No pending tasks"
            moreLink="/tasks"
            initialCount={5}
          />
        </div>
      </div>

      {/* Pipeline + Target & Revenue */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-white flex items-center gap-2">
            <span>📊</span> Pipeline by Stage
          </h2>
          <div className="space-y-2">
            {Object.entries(data.byStatus ?? {}).map(([status, count]) => (
              <Link
                key={status}
                href={`/leads?statuses=${encodeURIComponent(status)}`}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-700/50 transition-colors"
              >
                <span className="text-slate-300">{status}</span>
                <span className="font-medium">{Number(count) || 0}</span>
              </Link>
            ))}
            {(!data.byStatus || Object.keys(data.byStatus).length === 0) && (
              <p className="text-slate-500 text-sm">No leads yet</p>
            )}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold text-white flex items-center gap-2">
            <span>🎯</span> Target & Revenue ({tr?.monthLabel ?? "Monthly"})
          </h2>
          <p className="mb-2 text-xs text-slate-500" title="Target is based on received revenue only. Pending from previous months is not part of target.">
            Target is only on received. Pending from previous is not part of target.
          </p>
          {tr && (
            <div className="mb-4 p-3 rounded-lg bg-slate-700/50 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Admin totals</span>
                <span className="text-slate-300">
                  Target ₹{(tr.totalTarget ?? 0).toLocaleString()} · Received ₹{(tr.totalPaid ?? 0).toLocaleString()} · Pending ₹{(tr.totalPending ?? 0).toLocaleString()}
                </span>
              </div>
              <ProgressBar percent={targetPercent} color={targetPercent >= 100 ? "bg-emerald-500" : "bg-sky-500"} />
              <p className="text-xs text-slate-500">
                {tr.totalTarget ? Math.round(((tr.totalTarget - (tr.totalPaid ?? 0)) / tr.totalTarget) * 100) : 0}% to go
                {(tr.totalPendingFromPrevious ?? 0) > 0 && (
                  <span className="text-amber-300 ml-2">· Prev. pending ₹{(tr.totalPendingFromPrevious ?? 0).toLocaleString()}</span>
                )}
              </p>
            </div>
          )}
          <div className="space-y-3">
            {(data.bdmStats ?? []).map((s: { bdm: string; target: number; paid?: number; pending?: number; pendingFromPrevious?: number; percent: number }) => (
              <div key={s.bdm} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{s.bdm}</span>
                  <span className="text-right text-slate-400">
                    Target ₹{(s.target ?? 0).toLocaleString()} · Received ₹{(s.paid ?? 0).toLocaleString()} · Pending ₹{(s.pending ?? 0).toLocaleString()}
                    {(s.pendingFromPrevious ?? 0) > 0 && (
                      <span className="text-amber-300"> · Prev ₹{(s.pendingFromPrevious ?? 0).toLocaleString()}</span>
                    )}
                    {' '}({s.percent ?? 0}%)
                  </span>
                </div>
                <ProgressBar percent={Math.min(100, s.percent ?? 0)} color={(s.percent ?? 0) >= 100 ? "bg-emerald-500" : "bg-sky-500"} />
              </div>
            ))}
            {(!data.bdmStats || data.bdmStats.length === 0) && (
              <p className="text-slate-500 text-sm">Configure BDMs in Admin</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
