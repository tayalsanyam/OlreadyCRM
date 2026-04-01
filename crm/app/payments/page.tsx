"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";

import { fetcher } from "@/lib/fetcher";

export default function PaymentPendingPage() {
  const [bdm, setBdm] = useState("");
  const [plan, setPlan] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [overdue, setOverdue] = useState(false);
  const params = new URLSearchParams();
  if (bdm) params.set("bdm", bdm);
  if (plan) params.set("plan", plan);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (overdue) params.set("overdue", "true");
  const url = `/api/payments/pending${params.toString() ? `?${params}` : ""}`;
  const { data: pending = [], mutate } = useSWR(url, fetcher, { refreshInterval: 5000 });
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const { data: session } = useSWR("/api/auth/me", fetcher);
  const isAdmin = session?.user?.role === "admin";
  const [modal, setModal] = useState<{
    type: "lead" | "renewal";
    lead_id: string;
    name: string;
    balance: number;
    next_follow_up?: string;
    deal_id?: string;
    customer_ops_coordinator?: string | null;
  } | null>(null);
  const [followUpModal, setFollowUpModal] = useState<{ lead_id: string; name: string; next_follow_up?: string } | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("UPI");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [leadsCount, setLeadsCount] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [addOns, setAddOns] = useState("");
  const [opsCoordinator, setOpsCoordinator] = useState("");
  const [planStartDate, setPlanStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const isFullPayment = modal && Number(amount) >= (modal.balance ?? 0) && modal.balance > 0;
  const opsCoordinators = dropdowns?.ops_coordinators ?? [];

  async function handleRecordPayment() {
    if (!modal) return;
    if (isFullPayment && (!durationMonths || Number(durationMonths) < 1)) {
      alert("Duration (months) is required for full payment");
      return;
    }
    setSaving(true);
    try {
      if (modal.type === "renewal" && modal.deal_id) {
        const body: Record<string, unknown> = {
          amount: Number(amount),
          payment_mode: mode,
          ...(nextFollowUp?.trim() && { next_follow_up: nextFollowUp.trim().slice(0, 10) }),
        };
        if (isFullPayment) {
          body.leads_count = leadsCount ? Number(leadsCount) : undefined;
          body.duration_months = Number(durationMonths);
          body.ops_coordinator = opsCoordinator?.trim() || undefined;
          body.plan_start_date = planStartDate?.trim().slice(0, 10) || undefined;
        }
        const res = await fetch(`/api/renewal-deals/${modal.deal_id}/record-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setModal(null);
          setAmount("");
          setNextFollowUp("");
          setLeadsCount("");
          setDurationMonths("");
          setOpsCoordinator("");
          mutate();
        } else {
          const data = await res.json().catch(() => ({}));
          alert(data.error || "Failed");
        }
      } else {
        const body: Record<string, unknown> = {
          lead_id: modal.lead_id,
          amount: Number(amount),
          payment_mode: mode,
          ...(nextFollowUp?.trim() && { next_follow_up: nextFollowUp.trim().slice(0, 10) }),
        };
        if (isFullPayment) {
          body.leads_count = leadsCount ? Number(leadsCount) : undefined;
          body.duration_months = Number(durationMonths);
          body.add_ons = addOns?.trim() || undefined;
          body.ops_coordinator = opsCoordinator?.trim() || undefined;
          body.plan_start_date = planStartDate?.trim().slice(0, 10) || undefined;
        }
        const res = await fetch("/api/payments/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setModal(null);
          setAmount("");
          setNextFollowUp("");
          setLeadsCount("");
          setDurationMonths("");
          setAddOns("");
          setOpsCoordinator("");
          mutate();
        } else {
          const data = await res.json().catch(() => ({}));
          alert(data.error || "Failed");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  const bdms = dropdowns?.bdms ?? [];

  async function handleSetFollowUp() {
    if (!followUpModal || !followUpDate?.trim()) return;
    setSavingFollowUp(true);
    try {
      const res = await fetch(`/api/leads/${followUpModal.lead_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_follow_up: followUpDate.trim().slice(0, 10) }),
      });
      if (res.ok) {
        setFollowUpModal(null);
        setFollowUpDate("");
        mutate();
      }
    } finally {
      setSavingFollowUp(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Payment Pending</h1>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="mb-1 block text-xs text-slate-400">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input text-sm py-1.5 w-36" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input text-sm py-1.5 w-36" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">BDM</label>
            <select value={bdm} onChange={(e) => setBdm(e.target.value)} className="input text-sm py-1.5 w-32">
              <option value="">All BDMs</option>
              {bdms.map((b: string) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input text-sm py-1.5 w-32">
              <option value="">All Plans</option>
              {(dropdowns?.plans ?? []).map((p: { name: string; price: number } | string) => {
              const name = typeof p === "string" ? p : p?.name ?? "";
              return <option key={name} value={name}>{name}</option>;
            })}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(e) => setOverdue(e.target.checked)}
              className="rounded"
            />
            Overdue only
          </label>
        </div>
      </div>
      <p className="text-slate-400 text-sm">
        Confirmed leads with balance due. Set Original Price & Discount on the Lead page, then record payments here.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-600 text-left text-sm text-slate-400">
              <th className="p-2">Lead</th>
              <th className="p-2">BDM</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Selling</th>
              <th className="p-2">Paid</th>
              <th className="p-2">Balance</th>
              <th className="p-2">Status</th>
              <th className="p-2">Expected</th>
              <th className="p-2">Follow-up</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {(pending as Array<{
              type?: "lead" | "renewal";
              id: string; lead_id: string; name: string; bdm: string; plan: string;
              selling_price: number; amount_paid?: number; balance: number;
              committed_date?: string; next_follow_up?: string; status_label?: string; is_overdue?: boolean;
              customer_ops_coordinator?: string | null;
            }>).map((row) => (
              <tr
                key={`${row.type ?? "lead"}-${row.id}`}
                className={`border-b border-slate-700/50 ${row.is_overdue ? "bg-red-900/20 border-l-4 border-l-amber-500" : ""}`}
              >
                <td className="p-2">
                  <Link href={`/leads/${row.lead_id}`} className="text-sky-400 hover:underline">
                    {row.name}
                  </Link>
                  {row.type === "renewal" && <span className="ml-1 text-xs text-amber-400">(Renewal)</span>}
                </td>
                <td className="p-2 text-slate-300">{row.bdm}</td>
                <td className="p-2 text-slate-300">{typeof row.plan === "string" ? row.plan : (row.plan as { name?: string })?.name ?? "-"}</td>
                <td className="p-2">₹{row.selling_price?.toLocaleString() ?? 0}</td>
                <td className="p-2">₹{(row.amount_paid ?? 0).toLocaleString()}</td>
                <td className="p-2 text-amber-400">₹{row.balance?.toLocaleString() ?? 0}</td>
                <td className="p-2 text-slate-400">{row.status_label || "Full due"}</td>
                <td className={`p-2 ${row.is_overdue ? "text-amber-400 font-medium" : "text-slate-400"}`}>
                  {row.committed_date || "-"}
                  {row.is_overdue && " (Overdue)"}
                </td>
                <td className="p-2 text-slate-400">
                  {row.next_follow_up || "-"}
                  {row.type !== "renewal" && (
                    <button
                      type="button"
                      onClick={() => {
                        setFollowUpModal({ lead_id: row.lead_id, name: row.name, next_follow_up: row.next_follow_up });
                        setFollowUpDate(row.next_follow_up ?? "");
                      }}
                      className="text-sky-400 hover:underline text-xs ml-1"
                    >
                      Set
                    </button>
                  )}
                </td>
                <td className="p-2">
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        setModal({
                          type: row.type ?? "lead",
                          lead_id: row.lead_id,
                          name: row.name,
                          balance: row.balance ?? 0,
                          next_follow_up: row.next_follow_up,
                          ...(row.type === "renewal" && { deal_id: row.id, customer_ops_coordinator: row.customer_ops_coordinator }),
                        });
                        setNextFollowUp(row.next_follow_up ?? "");
                        setLeadsCount("");
                        setDurationMonths("");
                        setAddOns("");
                        setOpsCoordinator(row.type === "renewal" && row.customer_ops_coordinator ? row.customer_ops_coordinator : "");
                        setPlanStartDate(new Date().toISOString().slice(0, 10));
                      }}
                      className="btn-primary text-sm"
                    >
                      Record Payment
                    </button>
                  ) : (
                    <span className="text-slate-500 text-sm">Admin only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 p-6">
            <h2 className="mb-4 font-semibold text-white">Record Payment – {modal.name}{modal.type === "renewal" ? " (Renewal)" : ""}</h2>
            {modal.type !== "renewal" && (
              <p className="mb-3 text-sm text-slate-400">If selling price is 0, set Original Price & Discount on the Lead page first.</p>
            )}
            {modal.type === "renewal" && (
              <p className="mb-3 text-sm text-slate-500">Current Ops Coordinator: {modal.customer_ops_coordinator ?? "No Ops Coordinator"}</p>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Amount (₹)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="input"
                >
                  {["CASH", "BANK", "UPI", "CREDIT_CARD", "PAYMENT_LINK"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Next follow-up (when to chase remaining)</label>
                <input
                  type="date"
                  value={nextFollowUp}
                  onChange={(e) => setNextFollowUp(e.target.value)}
                  className="input"
                />
              </div>
              {isFullPayment && (
                <>
                  <div className="mt-4 pt-4 border-t border-slate-600">
                    <p className="mb-3 text-sm text-amber-400 font-medium">Subscriber plan details (full payment)</p>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm text-slate-400">Leads count</label>
                        <input type="number" value={leadsCount} onChange={(e) => setLeadsCount(e.target.value)} className="input" placeholder="0" min={0} />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-slate-400">Duration (months) *</label>
                        <input type="number" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} className="input" placeholder="e.g. 6" min={1} required />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-slate-400">Add-ons</label>
                        <input type="text" value={addOns} onChange={(e) => setAddOns(e.target.value)} className="input" placeholder="e.g. Confirmed Booking" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-slate-400">Plan start date</label>
                        <input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-slate-400">Ops Coordinator</label>
                        <select value={opsCoordinator} onChange={(e) => setOpsCoordinator(e.target.value)} className="input">
                          <option value="">Select</option>
                          {opsCoordinators.map((o: string) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={handleRecordPayment}
                className="btn-primary"
                disabled={saving || !!(isFullPayment && (!durationMonths || Number(durationMonths) < 1))}
              >
                {saving ? "Saving..." : "Record"}
              </button>
              <button onClick={() => setModal(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {followUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6">
            <h2 className="mb-4 font-semibold text-white">Set follow-up – {followUpModal.name}</h2>
            <p className="mb-3 text-sm text-slate-400">When to follow up for remaining payment.</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Next follow-up</label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={handleSetFollowUp} className="btn-primary" disabled={savingFollowUp || !followUpDate?.trim()}>
                {savingFollowUp ? "Saving..." : "Save"}
              </button>
              <button onClick={() => { setFollowUpModal(null); setFollowUpDate(""); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
