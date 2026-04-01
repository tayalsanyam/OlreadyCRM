"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";

import { fetcher } from "@/lib/fetcher";

type Task = {
  id: string;
  title: string;
  due: string;
  assignee: string;
  lead_id?: string;
  renewal_deal_id?: string;
};

type RenewalDeal = {
  id: string;
  status: string;
  next_follow_up?: string;
};

function resolveRenewalDealId(t: Task, renewalDeals: RenewalDeal[]): string | undefined {
  if (t.renewal_deal_id) return t.renewal_deal_id;
  if (!t.title?.startsWith("Renewal follow-up:") || !renewalDeals?.length) return undefined;
  const deal = renewalDeals.find((d) => d.status !== "PAID" && d.next_follow_up === t.due);
  return deal?.id;
}

function TaskDoneForm({
  t,
  renewalDeals,
  toggling,
  onToggleRenewal,
  onToggleLead,
  onCancel,
}: {
  t: Task;
  renewalDeals: RenewalDeal[];
  toggling: string | null;
  onToggleRenewal: (taskId: string, dealId: string, isDone: boolean, withUpdate?: { next_follow_up?: string; status?: string; rejection_reason?: string }) => void;
  onToggleLead: (taskId: string, leadId: string, isDone: boolean, withUpdate?: { next_follow_up?: string; remarks?: string; status?: string }) => void;
  onCancel: () => void;
}) {
  const [doneNextFollowUp, setDoneNextFollowUp] = useState("");
  const [doneRemarks, setDoneRemarks] = useState("");
  const [doneStatus, setDoneStatus] = useState("");
  const [doneRenewalStatus, setDoneRenewalStatus] = useState("RENEWAL_FOLLOW_UP");
  const [doneRejectionReason, setDoneRejectionReason] = useState("");

  const renewalDealId = resolveRenewalDealId(t, renewalDeals);

  if (!t.lead_id) {
    return (
      <div className="mt-2 flex gap-2">
        <button onClick={() => onToggleLead(t.id, "", true)} disabled={toggling === t.id} className="btn-secondary text-sm">Done</button>
        <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
      </div>
    );
  }

  if (renewalDealId) {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-slate-600 bg-slate-800/50 p-3 text-sm">
        <p className="text-slate-400 text-xs">Optional: update renewal deal when marking done</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-500">Next follow up</label>
            <input type="date" value={doneNextFollowUp} onChange={(e) => setDoneNextFollowUp(e.target.value)} className="input text-sm py-1 w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Status</label>
            <select value={doneRenewalStatus} onChange={(e) => setDoneRenewalStatus(e.target.value)} className="input text-sm py-1 w-full">
              <option value="RENEWAL_FOLLOW_UP">RENEWAL_FOLLOW_UP</option>
              <option value="RENEWAL_REJECTED">RENEWAL_REJECTED</option>
            </select>
          </div>
        </div>
        {doneRenewalStatus === "RENEWAL_REJECTED" && (
          <div>
            <label className="block text-xs text-slate-500">Rejection reason *</label>
            <input type="text" value={doneRejectionReason} onChange={(e) => setDoneRejectionReason(e.target.value)} className="input text-sm py-1 w-full" placeholder="e.g. Budget, competitor" />
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (doneRenewalStatus === "RENEWAL_REJECTED" && !doneRejectionReason?.trim()) {
                alert("Rejection reason required");
                return;
              }
              onToggleRenewal(t.id, renewalDealId, true, {
                next_follow_up: doneNextFollowUp || undefined,
                status: doneRenewalStatus || undefined,
                rejection_reason: doneRenewalStatus === "RENEWAL_REJECTED" ? doneRejectionReason || undefined : undefined,
              });
            }}
            disabled={toggling === t.id}
            className="btn-primary text-sm"
          >
            Confirm
          </button>
          <button onClick={() => onToggleRenewal(t.id, renewalDealId, true)} disabled={toggling === t.id} className="btn-secondary text-sm">Done</button>
          <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-slate-600 bg-slate-800/50 p-3 text-sm">
      <p className="text-slate-400 text-xs">Optional: update lead when marking done</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-slate-500">Next follow up</label>
          <input type="date" value={doneNextFollowUp} onChange={(e) => setDoneNextFollowUp(e.target.value)} className="input text-sm py-1 w-full" />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Status</label>
          <select value={doneStatus} onChange={(e) => setDoneStatus(e.target.value)} className="input text-sm py-1 w-full">
            {["UNTOUCHED", "CONTACTED", "FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID", "PAID", "DENIED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-500">Remarks</label>
        <textarea value={doneRemarks} onChange={(e) => setDoneRemarks(e.target.value)} className="input text-sm py-1 w-full min-h-[60px]" rows={2} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onToggleLead(t.id, t.lead_id!, true, { next_follow_up: doneNextFollowUp || undefined, remarks: doneRemarks || undefined, status: doneStatus || undefined })}
          disabled={toggling === t.id}
          className="btn-primary text-sm"
        >
          Confirm
        </button>
        <button onClick={() => onToggleLead(t.id, t.lead_id!, true)} disabled={toggling === t.id} className="btn-secondary text-sm">Done</button>
        <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [bdm, setBdm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const params = new URLSearchParams();
  params.set("done", "false");
  if (bdm) params.set("assignee", bdm);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const { data: pending = [], mutate: mutatePending } = useSWR(`/api/tasks?${params}`, fetcher, { refreshInterval: 5000 });

  const paramsDone = new URLSearchParams();
  paramsDone.set("done", "true");
  if (bdm) paramsDone.set("assignee", bdm);
  if (dateFrom) paramsDone.set("dateFrom", dateFrom);
  if (dateTo) paramsDone.set("dateTo", dateTo);
  const { data: done = [], mutate: mutateDone } = useSWR(`/api/tasks?${paramsDone}`, fetcher, { refreshInterval: 5000 });
  const [toggling, setToggling] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const overdue = (pending as Task[]).filter((t) => t.due && t.due < today);
  const upcoming = (pending as Task[]).filter((t) => !t.due || t.due >= today);

  const completingTaskData = completingTask ? (pending as Task[]).find((p) => p.id === completingTask) : null;
  const { data: renewalDeals = [] } = useSWR<RenewalDeal[]>(
    completingTaskData?.lead_id ? `/api/renewal-deals?lead_id=${completingTaskData.lead_id}` : null,
    fetcher
  );

  async function toggleDoneRenewal(
    taskId: string,
    renewalDealId: string,
    isDone: boolean,
    withUpdate?: { next_follow_up?: string; status?: string; rejection_reason?: string }
  ) {
    setToggling(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: isDone }),
      });
      if (res.ok) {
        mutatePending();
        mutateDone();
        if (withUpdate && (withUpdate.next_follow_up || withUpdate.status || withUpdate.rejection_reason)) {
          await fetch(`/api/renewal-deals/${renewalDealId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              next_follow_up: withUpdate.next_follow_up || undefined,
              status: withUpdate.status || undefined,
              rejection_reason: withUpdate.rejection_reason || undefined,
            }),
          });
        }
      }
    } finally {
      setToggling(null);
      setCompletingTask(null);
    }
  }

  async function toggleDoneLead(
    taskId: string,
    leadId: string,
    isDone: boolean,
    withUpdate?: { next_follow_up?: string; remarks?: string; status?: string }
  ) {
    setToggling(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: isDone }),
      });
      if (res.ok) {
        mutatePending();
        mutateDone();
        if (leadId && withUpdate && (withUpdate.next_follow_up || withUpdate.remarks || withUpdate.status)) {
          await fetch(`/api/leads/${leadId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              next_follow_up: withUpdate.next_follow_up || undefined,
              remarks: withUpdate.remarks || undefined,
              status: withUpdate.status || undefined,
            }),
          });
        }
      }
    } finally {
      setToggling(null);
      setCompletingTask(null);
    }
  }

  async function toggleDoneSimple(id: string, isDone: boolean) {
    setToggling(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: isDone }),
      });
      if (res.ok) {
        mutatePending();
        mutateDone();
      }
    } finally {
      setToggling(null);
      setCompletingTask(null);
    }
  }

  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const bdms = dropdowns?.bdms ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <div className="flex flex-wrap gap-2">
          <select value={bdm} onChange={(e) => setBdm(e.target.value)} className="input text-sm py-1.5 w-32">
            <option value="">All BDMs</option>
            {bdms.map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input text-sm py-1.5 w-36" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input text-sm py-1.5 w-36" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">Overdue</h2>
          <div className="space-y-2">
            {overdue.length === 0 && <p className="text-slate-500 text-sm">None</p>}
            {overdue.map((t) => (
              <div key={t.id} className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{t.title}</p>
                    <p className="text-xs text-slate-400">
                      Due: {t.due} · {t.assignee}
                      {t.lead_id && (
                        <Link href={`/leads/${t.lead_id}`} className="ml-2 text-sky-400">View lead</Link>
                      )}
                    </p>
                  </div>
                  {completingTask === t.id ? null : (
                    <button
                      onClick={() => setCompletingTask(completingTask === t.id ? null : t.id)}
                      disabled={toggling === t.id}
                      className="btn-secondary text-sm"
                    >
                      Done
                    </button>
                  )}
                </div>
                {completingTask === t.id && (
                  <TaskDoneForm
                    t={t}
                    renewalDeals={renewalDeals}
                    toggling={toggling}
                    onToggleRenewal={toggleDoneRenewal}
                    onToggleLead={(taskId, leadId, isDone, withUpdate) => {
                      if (leadId) toggleDoneLead(taskId, leadId, isDone, withUpdate);
                      else toggleDoneSimple(taskId, isDone);
                    }}
                    onCancel={() => setCompletingTask(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.length === 0 && <p className="text-slate-500 text-sm">None</p>}
            {upcoming.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-600 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{t.title}</p>
                    <p className="text-xs text-slate-400">
                      Due: {t.due} · {t.assignee}
                      {t.lead_id && (
                        <Link href={`/leads/${t.lead_id}`} className="ml-2 text-sky-400">View lead</Link>
                      )}
                    </p>
                  </div>
                  {completingTask === t.id ? null : (
                    <button
                      onClick={() => setCompletingTask(completingTask === t.id ? null : t.id)}
                      disabled={toggling === t.id}
                      className="btn-secondary text-sm"
                    >
                      Done
                    </button>
                  )}
                </div>
                {completingTask === t.id && (
                  <TaskDoneForm
                    t={t}
                    renewalDeals={renewalDeals}
                    toggling={toggling}
                    onToggleRenewal={toggleDoneRenewal}
                    onToggleLead={(taskId, leadId, isDone, withUpdate) => {
                      if (leadId) toggleDoneLead(taskId, leadId, isDone, withUpdate);
                      else toggleDoneSimple(taskId, isDone);
                    }}
                    onCancel={() => setCompletingTask(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold text-white">Done</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {done.length === 0 && <p className="text-slate-400 text-sm">No completed tasks</p>}
            {done.map((t: Task) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/30 p-3"
              >
                <div>
                  <p className="text-slate-300 line-through">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.due} · {t.assignee}</p>
                </div>
                <button
                  onClick={() => toggleDoneSimple(t.id, false)}
                  disabled={toggling === t.id}
                  className="btn-ghost text-sm"
                >
                  Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
