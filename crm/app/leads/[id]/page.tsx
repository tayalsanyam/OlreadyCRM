"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";

import { fetcher } from "@/lib/fetcher";

type Sub = {
  id: string;
  subscription_type: string;
  bdm: string;
  leads_count?: number;
  duration_months: number;
  price_paid: number;
  plan_start_date: string;
  plan_end_date: string;
  business_generated?: string;
  overall_experience?: string;
  plan_name: string;
  ops_coordinator?: string;
};

type RenewalDeal = {
  id: string;
  plan_name: string;
  subscription_type: string;
  status: string;
  committed_date?: string;
  next_follow_up?: string;
  rejection_reason?: string;
  original_price?: number;
  discount?: number;
  amount_paid?: number;
  balance?: number;
  selling_price?: number;
  ops_coordinator?: string;
};

function SubscriptionsForLead({
  leadId,
  lead,
  customer,
  subscriptions,
  renewalDeals,
  mutateSubs,
  mutateRenewals,
  dropdowns,
}: {
  leadId: string;
  lead: { name: string; bdm: string; plan?: string };
  customer?: { ops_coordinator?: string } | null;
  subscriptions: Sub[];
  renewalDeals: RenewalDeal[];
  mutateSubs: () => void;
  mutateRenewals: () => void;
  dropdowns?: { plans?: { name?: string }[] };
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [subType, setSubType] = useState<"renewal" | "upgrade">("renewal");
  const [planName, setPlanName] = useState(lead.plan ?? "");
  const [connectedOn, setConnectedOn] = useState(new Date().toISOString().slice(0, 10));
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [addOns, setAddOns] = useState("");
  const [confirmingDeal, setConfirmingDeal] = useState<string | null>(null);
  const [confirmOriginalPrice, setConfirmOriginalPrice] = useState("");
  const [confirmDiscount, setConfirmDiscount] = useState("");
  const [confirmCommittedDate, setConfirmCommittedDate] = useState("");
  const [confirmNextFollowUp, setConfirmNextFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editBiz, setEditBiz] = useState("");
  const [editExp, setEditExp] = useState("");
  const [editingFollowUp, setEditingFollowUp] = useState<string | null>(null);
  const [editFollowUpDate, setEditFollowUpDate] = useState("");
  const [rejectingDeal, setRejectingDeal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNextFollowUp, setRejectNextFollowUp] = useState("");

  const plans = dropdowns?.plans ?? [];
  const planOptions = Array.isArray(plans) ? plans : [];

  async function handleAddRenewalDeal() {
    if (!planName?.trim()) {
      alert("Plan is required");
      return;
    }
    if (!nextFollowUp?.trim()) {
      alert("Next follow-up date is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/renewal-deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          subscription_type: subType,
          plan_name: planName,
          connected_on: connectedOn || undefined,
          next_follow_up: nextFollowUp || undefined,
          add_ons: addOns?.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setNextFollowUp("");
        setAddOns("");
        mutateRenewals();
      } else {
        const d = await res.json();
        alert(d.error || "Failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDeal(dealId: string) {
    if (!confirmOriginalPrice || Number(confirmOriginalPrice) < 0) {
      alert("Original Price is required");
      return;
    }
    if (!confirmCommittedDate?.trim()) {
      alert("Committed date is required to move to pending payment");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/renewal-deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONFIRMED",
          original_price: Number(confirmOriginalPrice),
          discount: Number(confirmDiscount) || 0,
          committed_date: confirmCommittedDate?.trim().slice(0, 10) || undefined,
          next_follow_up: confirmNextFollowUp?.trim().slice(0, 10) || undefined,
        }),
      });
      if (res.ok) {
        setConfirmingDeal(null);
        setConfirmOriginalPrice("");
        setConfirmDiscount("");
        setConfirmCommittedDate("");
        setConfirmNextFollowUp("");
        mutateRenewals();
      } else {
        const d = await res.json();
        alert(d.error || "Failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRejectDeal(dealId: string) {
    if (!rejectReason?.trim()) {
      alert("Rejection reason is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/renewal-deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "RENEWAL_REJECTED",
          rejection_reason: rejectReason.trim(),
          next_follow_up: rejectNextFollowUp?.trim().slice(0, 10) || undefined,
        }),
      });
      if (res.ok) {
        setRejectingDeal(null);
        setRejectReason("");
        setRejectNextFollowUp("");
        mutateRenewals();
      } else {
        const d = await res.json();
        alert(d.error || "Failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRenewalFollowUp(dealId: string) {
    if (!editFollowUpDate?.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/renewal-deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_follow_up: editFollowUpDate.trim().slice(0, 10) }),
      });
      if (res.ok) {
        setEditingFollowUp(null);
        setEditFollowUpDate("");
        mutateRenewals();
      } else {
        const d = await res.json();
        alert(d.error || "Failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSubBusiness(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_generated: editBiz, overall_experience: editExp }),
      });
      if (res.ok) {
        setEditingSub(null);
        setEditBiz("");
        setEditExp("");
        mutateSubs();
      }
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeSubs = (subscriptions as Sub[]).filter((s) => s.plan_end_date >= today);
  const getOpsForPlan = (planName: string) => {
    const match = activeSubs.find((s) => s.plan_name === planName) ?? activeSubs[0];
    return match?.ops_coordinator ?? customer?.ops_coordinator ?? "No Ops Coordinator";
  };

  return (
    <div className="space-y-4">
      {(subscriptions as Sub[]).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-600 text-left text-slate-400">
                <th className="p-2">Type</th>
                <th className="p-2">BDM</th>
                <th className="p-2">Plan</th>
                <th className="p-2">Leads</th>
                <th className="p-2">Duration</th>
                <th className="p-2">Payment</th>
                <th className="p-2">Start</th>
                <th className="p-2">Expiry</th>
                <th className="p-2">Ops</th>
                <th className="p-2">Business</th>
                <th className="p-2">Experience</th>
                <th className="p-2">Edit</th>
              </tr>
            </thead>
            <tbody>
              {(subscriptions as Sub[]).map((s) => (
                <tr key={s.id} className="border-b border-slate-700/50">
                  <td className="p-2 text-slate-300">{s.subscription_type}</td>
                  <td className="p-2 text-slate-300">{s.bdm}</td>
                  <td className="p-2 text-slate-300">{s.plan_name}</td>
                  <td className="p-2 text-slate-400">{s.leads_count ?? "-"}</td>
                  <td className="p-2 text-slate-400">{s.duration_months} mo</td>
                  <td className="p-2">₹{(s.price_paid ?? 0).toLocaleString()}</td>
                  <td className="p-2 text-slate-400">{s.plan_start_date}</td>
                  <td className="p-2 text-amber-400">{s.plan_end_date}</td>
                  <td className="p-2 text-slate-400">{s.ops_coordinator ?? "-"}</td>
                  {editingSub === s.id ? (
                    <td colSpan={3} className="p-2">
                      <div className="flex gap-2 flex-wrap">
                        <input
                          type="text"
                          value={editBiz}
                          onChange={(e) => setEditBiz(e.target.value)}
                          placeholder="Business generated"
                          className="input text-sm flex-1 min-w-24"
                        />
                        <input
                          type="text"
                          value={editExp}
                          onChange={(e) => setEditExp(e.target.value)}
                          placeholder="Experience"
                          className="input text-sm flex-1 min-w-24"
                        />
                        <button onClick={() => handleSaveSubBusiness(s.id)} disabled={saving} className="btn-primary text-xs">Save</button>
                        <button onClick={() => { setEditingSub(null); setEditBiz(""); setEditExp(""); }} className="btn-secondary text-xs">Cancel</button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="p-2 text-slate-500 max-w-24 truncate" title={s.business_generated}>{s.business_generated || "-"}</td>
                      <td className="p-2 text-slate-500 max-w-24 truncate" title={s.overall_experience}>{s.overall_experience || "-"}</td>
                      <td className="p-2">
                        <button onClick={() => { setEditingSub(s.id); setEditBiz(s.business_generated ?? ""); setEditExp(s.overall_experience ?? ""); }} className="text-sky-400 hover:underline text-xs">Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(renewalDeals as RenewalDeal[]).length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-400">Renewal deals (pending payment)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="p-2">Type</th>
                  <th className="p-2">Plan</th>
                  <th className="p-2">Leads</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Follow Up</th>
                  <th className="p-2">Committed</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2">Ops</th>
                  <th className="p-2">Original</th>
                  <th className="p-2">Discount</th>
                  <th className="p-2">Paid</th>
                  <th className="p-2">Balance</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
                  <tbody>
                {(renewalDeals as RenewalDeal[]).filter((d) => d.status !== "PAID").map((d) => (
                  <React.Fragment key={d.id}>
                  <tr className="border-b border-slate-700/50">
                    <td className="p-2 text-slate-300">{d.subscription_type}</td>
                    <td className="p-2 text-slate-300">{d.plan_name}</td>
                    <td className="p-2 text-slate-400">-</td>
                    <td className="p-2">
                      {d.status === "RENEWAL_FOLLOW_UP" ? (
                        <span className="badge bg-slate-500">{d.status}</span>
                      ) : d.status === "RENEWAL_REJECTED" ? (
                        <span className="badge bg-red-600/80">{d.status}</span>
                      ) : (
                        <span className="badge bg-amber-600/80">{d.status}</span>
                      )}
                    </td>
                    <td className="p-2">
                      {editingFollowUp === d.id ? (
                        <div className="flex gap-1 items-center">
                          <input
                            type="date"
                            value={editFollowUpDate}
                            onChange={(e) => setEditFollowUpDate(e.target.value)}
                            className="input text-sm py-0.5 w-32"
                          />
                          <button onClick={() => handleSaveRenewalFollowUp(d.id)} disabled={saving || !editFollowUpDate} className="text-sky-400 hover:underline text-xs">Save</button>
                          <button onClick={() => { setEditingFollowUp(null); setEditFollowUpDate(""); }} className="text-slate-500 hover:underline text-xs">Cancel</button>
                        </div>
                      ) : (
                        <span
                          className="text-slate-400 cursor-pointer hover:text-sky-400"
                          onClick={() => { setEditingFollowUp(d.id); setEditFollowUpDate(d.next_follow_up ?? ""); }}
                          title="Click to edit"
                        >
                          {d.next_follow_up || "-"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-slate-400">{d.committed_date || "-"}</td>
                    <td className="p-2 text-slate-400 max-w-24 truncate" title={d.rejection_reason}>{d.rejection_reason || "-"}</td>
                    <td className="p-2 text-slate-400">{getOpsForPlan(d.plan_name)}</td>
                    <td className="p-2">₹{(d.original_price ?? 0).toLocaleString()}</td>
                    <td className="p-2">₹{(d.discount ?? 0).toLocaleString()}</td>
                    <td className="p-2">₹{(d.amount_paid ?? 0).toLocaleString()}</td>
                    <td className="p-2 text-amber-400">₹{(d.balance ?? 0).toLocaleString()}</td>
                    <td className="p-2">
                      {d.status === "RENEWAL_FOLLOW_UP" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setConfirmingDeal(d.id);
                              setConfirmOriginalPrice("");
                              setConfirmDiscount("");
                              setConfirmCommittedDate("");
                              setConfirmNextFollowUp("");
                            }}
                            className="text-sky-400 hover:underline text-xs"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setRejectingDeal(rejectingDeal === d.id ? null : d.id)}
                            className="text-red-400 hover:underline text-xs"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {rejectingDeal === d.id && (
                    <tr key={`${d.id}-reject`} className="border-b border-slate-700/50 bg-red-900/10">
                      <td colSpan={13} className="p-4">
                        <div className="space-y-3">
                          <p className="text-sm text-slate-400">Reject renewal: record reason and optional follow-up date</p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-xs text-slate-400">Rejection reason *</label>
                              <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="input text-sm w-full" placeholder="e.g. Budget, competitor, no response" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Next follow up</label>
                              <input type="date" value={rejectNextFollowUp} onChange={(e) => setRejectNextFollowUp(e.target.value)} className="input text-sm" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleRejectDeal(d.id)} disabled={saving || !rejectReason?.trim()} className="btn-primary text-sm">
                              {saving ? "Saving..." : "Reject"}
                            </button>
                            <button onClick={() => { setRejectingDeal(null); setRejectReason(""); setRejectNextFollowUp(""); }} className="btn-secondary text-sm">Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {confirmingDeal === d.id && (
                    <tr key={`${d.id}-confirm`} className="border-b border-slate-700/50 bg-slate-800/50">
                      <td colSpan={13} className="p-4">
                        <div className="space-y-3">
                          <p className="text-sm text-slate-400">Confirm renewal: set price and committed date to move to pending payment</p>
                          <p className="text-xs text-slate-500">Current Ops Coordinator: {getOpsForPlan(d.plan_name)}</p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Original Price (₹) *</label>
                              <input type="number" value={confirmOriginalPrice} onChange={(e) => setConfirmOriginalPrice(e.target.value)} className="input text-sm" placeholder="e.g. 10000" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Discount (₹)</label>
                              <input type="number" value={confirmDiscount} onChange={(e) => setConfirmDiscount(e.target.value)} className="input text-sm" placeholder="0" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Committed Date *</label>
                              <input type="date" value={confirmCommittedDate} onChange={(e) => setConfirmCommittedDate(e.target.value)} className="input text-sm" required />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">Next Follow Up</label>
                              <input type="date" value={confirmNextFollowUp} onChange={(e) => setConfirmNextFollowUp(e.target.value)} className="input text-sm" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleConfirmDeal(d.id)} disabled={saving || !confirmOriginalPrice || !confirmCommittedDate?.trim()} className="btn-primary text-sm">
                              {saving ? "Saving..." : "Confirm"}
                            </button>
                            <button onClick={() => { setConfirmingDeal(null); setConfirmOriginalPrice(""); setConfirmDiscount(""); setConfirmCommittedDate(""); setConfirmNextFollowUp(""); }} className="btn-secondary text-sm">Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-slate-500">Record payment in Payment Pending tab</p>
        </div>
      )}
      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} className="btn-secondary text-sm">
          Add Renewal Deal
        </button>
      ) : (
        <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-white">Add Renewal Deal</h3>
          <p className="text-xs text-slate-500">Current Ops Coordinator: {getOpsForPlan(planName)}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Type</label>
              <select value={subType} onChange={(e) => setSubType(e.target.value as "renewal" | "upgrade")} className="input text-sm">
                <option value="renewal">Renewal</option>
                <option value="upgrade">Upgrade</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Plan *</label>
              <select value={planName} onChange={(e) => setPlanName(e.target.value)} className="input text-sm">
                <option value="">Select</option>
                {planOptions.map((p: { name?: string }) => {
                  const n = p?.name ?? "";
                  return n ? <option key={n} value={n}>{n}</option> : null;
                })}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Connected On</label>
              <input type="date" value={connectedOn} onChange={(e) => setConnectedOn(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Next Follow Up *</label>
              <input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} className="input text-sm" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Add-ons</label>
              <input type="text" value={addOns} onChange={(e) => setAddOns(e.target.value)} className="input text-sm" placeholder="e.g. Confirmed Booking" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddRenewalDeal} disabled={saving || !planName?.trim() || !nextFollowUp?.trim()} className="btn-primary text-sm">
              {saving ? "Saving..." : "Add"}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TasksForLead({
  leadId,
  leadName,
  bdm,
  leadStatus,
  mutateLead,
  renewalDeals,
  mutateRenewals,
}: {
  leadId: string;
  leadName: string;
  bdm: string;
  leadStatus?: string;
  mutateLead?: () => void;
  renewalDeals?: RenewalDeal[];
  mutateRenewals?: () => void;
}) {
  function resolveRenewalDealId(t: { renewal_deal_id?: string; title?: string; due?: string }): string | undefined {
    if (t.renewal_deal_id) return t.renewal_deal_id;
    if (!t.title?.startsWith("Renewal follow-up:") || !renewalDeals?.length) return undefined;
    const deal = renewalDeals.find((d) => d.status !== "PAID" && d.next_follow_up === t.due);
    return deal?.id;
  }

  const { data: tasks = [], mutate } = useSWR(`/api/tasks?lead_id=${leadId}&done=false`, fetcher);
  const { data: done = [], mutate: mutateDone } = useSWR(`/api/tasks?lead_id=${leadId}&done=true`, fetcher);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [doneNextFollowUp, setDoneNextFollowUp] = useState("");
  const [doneRemarks, setDoneRemarks] = useState("");
  const [doneStatus, setDoneStatus] = useState(leadStatus ?? "");
  const [doneRenewalStatus, setDoneRenewalStatus] = useState("RENEWAL_FOLLOW_UP");
  const [doneRejectionReason, setDoneRejectionReason] = useState("");
  React.useEffect(() => {
    setDoneStatus(leadStatus ?? "");
  }, [leadStatus]);

  const today = new Date().toISOString().slice(0, 10);

  async function toggleDoneRenewal(taskId: string, renewalDealId: string, isDone: boolean, withUpdate?: { next_follow_up?: string; status?: string; rejection_reason?: string }) {
    setToggling(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: isDone }),
      });
      if (res.ok) {
        mutate();
        mutateDone();
        if (withUpdate && (withUpdate.next_follow_up || withUpdate.status || withUpdate.rejection_reason)) {
          const patchRes = await fetch(`/api/renewal-deals/${renewalDealId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              next_follow_up: withUpdate.next_follow_up || undefined,
              status: withUpdate.status || undefined,
              rejection_reason: withUpdate.rejection_reason || undefined,
            }),
          });
          if (patchRes.ok) mutateRenewals?.();
        }
      }
    } finally {
      setToggling(null);
      setCompletingTask(null);
      setDoneNextFollowUp("");
      setDoneRemarks("");
      setDoneStatus(leadStatus ?? "");
      setDoneRenewalStatus("RENEWAL_FOLLOW_UP");
      setDoneRejectionReason("");
    }
  }

  async function addTask() {
    if (!newTitle || !newDue) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, due: newDue, assignee: bdm, lead_id: leadId }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewDue("");
        mutate();
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(taskId: string, isDone: boolean, withLeadUpdate?: { next_follow_up?: string; remarks?: string; status?: string }) {
    setToggling(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: isDone }),
      });
      if (res.ok) {
        mutate();
        mutateDone();
        if (withLeadUpdate && (withLeadUpdate.next_follow_up || withLeadUpdate.remarks || withLeadUpdate.status)) {
          const patchRes = await fetch(`/api/leads/${leadId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              next_follow_up: withLeadUpdate.next_follow_up || undefined,
              remarks: withLeadUpdate.remarks || undefined,
              status: withLeadUpdate.status || undefined,
            }),
          });
          if (patchRes.ok) mutateLead?.();
        }
      }
    } finally {
      setToggling(null);
      setCompletingTask(null);
      setDoneNextFollowUp("");
      setDoneRemarks("");
      setDoneStatus(leadStatus ?? "");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="input flex-1 min-w-32"
          placeholder="Task title"
        />
        <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="input w-36" />
        <button onClick={addTask} disabled={adding} className="btn-secondary text-sm">
          {adding ? "Adding..." : "Add Task"}
        </button>
      </div>
      <div className="space-y-4 max-h-60 overflow-y-auto">
        {tasks.length === 0 && done.length === 0 && <p className="text-slate-500 text-sm">No tasks</p>}
        {(() => {
          const overdue = tasks.filter((t: { due: string }) => t.due < today);
          const upcoming = tasks.filter((t: { due: string }) => t.due >= today);
          return (
            <>
              {overdue.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-amber-400 uppercase tracking-wide">Overdue</h3>
                  <div className="space-y-1">
                    {overdue.map((t: { id: string; title: string; due: string }) => (
                      <div key={t.id} className="space-y-2">
                        <div className="flex justify-between items-center p-2 rounded bg-amber-500/10">
                          <span className="text-sm">{t.title} · {t.due}</span>
                          <button
                            onClick={() => setCompletingTask(completingTask === t.id ? null : t.id)}
                            disabled={toggling === t.id}
                            className="btn-ghost text-xs"
                          >
                            Done
                          </button>
                        </div>
                        {completingTask === t.id && (
                          <div className="p-3 rounded bg-slate-800/80 border border-slate-600 space-y-2 text-sm">
                            {resolveRenewalDealId(t) ? (
                              <>
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
                                  <button onClick={() => { if (doneRenewalStatus === "RENEWAL_REJECTED" && !doneRejectionReason?.trim()) { alert("Rejection reason required"); return; } toggleDoneRenewal(t.id, resolveRenewalDealId(t)!, true, { next_follow_up: doneNextFollowUp || undefined, status: doneRenewalStatus || undefined, rejection_reason: doneRenewalStatus === "RENEWAL_REJECTED" ? doneRejectionReason || undefined : undefined }); }} disabled={toggling === t.id} className="btn-primary text-xs">Confirm</button>
                                  <button onClick={() => toggleDoneRenewal(t.id, resolveRenewalDealId(t)!, true)} disabled={toggling === t.id} className="btn-secondary text-xs">Done</button>
                                  <button onClick={() => setCompletingTask(null)} className="btn-ghost text-xs">Cancel</button>
                                </div>
                              </>
                            ) : (
                              <>
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
                                  <button onClick={() => toggleDone(t.id, true, { next_follow_up: doneNextFollowUp || undefined, remarks: doneRemarks || undefined, status: doneStatus || undefined })} disabled={toggling === t.id} className="btn-primary text-xs">Confirm</button>
                                  <button onClick={() => toggleDone(t.id, true)} disabled={toggling === t.id} className="btn-secondary text-xs">Done</button>
                                  <button onClick={() => setCompletingTask(null)} className="btn-ghost text-xs">Cancel</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {upcoming.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Upcoming</h3>
                  <div className="space-y-1">
                    {upcoming.map((t: { id: string; title: string; due: string }) => (
                      <div key={t.id} className="space-y-2">
                        <div className="flex justify-between items-center p-2 rounded bg-slate-700/50">
                          <span className="text-sm">{t.title} · {t.due}</span>
                          <button
                            onClick={() => setCompletingTask(completingTask === t.id ? null : t.id)}
                            disabled={toggling === t.id}
                            className="btn-ghost text-xs"
                          >
                            Done
                          </button>
                        </div>
                        {completingTask === t.id && (
                          <div className="p-3 rounded bg-slate-800/80 border border-slate-600 space-y-2 text-sm">
                            {resolveRenewalDealId(t) ? (
                              <>
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
                                  <button onClick={() => { if (doneRenewalStatus === "RENEWAL_REJECTED" && !doneRejectionReason?.trim()) { alert("Rejection reason required"); return; } toggleDoneRenewal(t.id, resolveRenewalDealId(t)!, true, { next_follow_up: doneNextFollowUp || undefined, status: doneRenewalStatus || undefined, rejection_reason: doneRenewalStatus === "RENEWAL_REJECTED" ? doneRejectionReason || undefined : undefined }); }} disabled={toggling === t.id} className="btn-primary text-xs">Confirm</button>
                                  <button onClick={() => toggleDoneRenewal(t.id, resolveRenewalDealId(t)!, true)} disabled={toggling === t.id} className="btn-secondary text-xs">Done</button>
                                  <button onClick={() => setCompletingTask(null)} className="btn-ghost text-xs">Cancel</button>
                                </div>
                              </>
                            ) : (
                              <>
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
                                  <button onClick={() => toggleDone(t.id, true, { next_follow_up: doneNextFollowUp || undefined, remarks: doneRemarks || undefined, status: doneStatus || undefined })} disabled={toggling === t.id} className="btn-primary text-xs">Confirm</button>
                                  <button onClick={() => toggleDone(t.id, true)} disabled={toggling === t.id} className="btn-secondary text-xs">Done</button>
                                  <button onClick={() => setCompletingTask(null)} className="btn-ghost text-xs">Cancel</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {done.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Done</h3>
                  <div className="space-y-1">
                    {done.map((t: { id: string; title: string; due: string }) => (
                      <div key={t.id} className="flex justify-between items-center p-2 rounded bg-slate-700/30">
                        <span className="text-sm text-slate-500 line-through">{t.title}</span>
                        <button onClick={() => toggleDone(t.id, false)} disabled={toggling === t.id} className="btn-ghost text-xs">Undo</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const { data: lead, mutate } = useSWR(id ? `/api/leads/${id}` : null, fetcher);
  const { data: activity = [] } = useSWR(id ? `/api/leads/${id}/activity` : null, fetcher);
  const showSubsAndRenewals = lead?.status === "PAID" || lead?.leadType === "on_plan" || lead?.leadType === "existing_customer";
  const { data: subscriptions = [], mutate: mutateSubs } = useSWR(
    id && showSubsAndRenewals ? `/api/subscriptions?lead_id=${id}` : null,
    fetcher
  );
  const { data: renewalDeals = [], mutate: mutateRenewals } = useSWR(
    id && showSubsAndRenewals ? `/api/renewal-deals?lead_id=${id}` : null,
    fetcher
  );
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instaId, setInstaId] = useState("");
  const [bdm, setBdm] = useState("");
  const [plan, setPlan] = useState("");
  const [connectedOn, setConnectedOn] = useState("");
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [committedDate, setCommittedDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (lead) {
      setName(lead.name ?? "");
      setCity(lead.city ?? "");
      setCompany(lead.company ?? "");
      setPhone(lead.phone ?? "");
      setEmail(lead.email ?? "");
      setInstaId(lead.insta_id ?? "");
      setBdm(lead.bdm ?? "");
      setPlan(lead.plan ?? "");
      setConnectedOn(lead.connected_on ?? "");
      setStatus(lead.status ?? "");
      setRemarks(lead.remarks ?? "");
      setLostReason(lead.lost_reason ?? "");
      setNextFollowUp(lead.next_follow_up ?? "");
      setOriginalPrice(lead.original_price != null ? String(lead.original_price) : "");
      setDiscount(lead.discount != null ? String(lead.discount) : "");
      setCommittedDate(lead.committed_date ?? "");
    }
  }, [lead]);

  async function handleSave() {
    if (!lead) return;
    setSaveError("");
    const requiresFollowUp = ["FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID"].includes(status);
    if (requiresFollowUp && !nextFollowUp?.trim()) {
      setSaveError("Next Follow Up is required when status is FOLLOW UP/DETAILS SHARED, CONFIRMED or PARTLY_PAID");
      return;
    }
    if (status === "DENIED" && !lostReason?.trim()) {
      setSaveError("Lost reason is required when status is DENIED");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim() || lead.name,
        city: city.trim() || lead.city,
        company: company.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        insta_id: instaId.trim() || undefined,
        bdm: bdm.trim() || lead.bdm,
        plan: plan.trim() || undefined,
        connected_on: connectedOn || undefined,
        status,
        remarks,
        lost_reason: status === "DENIED" ? lostReason || undefined : undefined,
        next_follow_up: nextFollowUp || undefined,
        committed_date: committedDate || undefined,
      };
      if (originalPrice) payload.original_price = Number(originalPrice);
      if (discount) payload.discount = Number(discount);
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        mutate();
      } else {
        const d = await res.json();
        setSaveError(d.error || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!lead) return <div className="text-slate-400">Loading...</div>;

  const sellingPrice =
    lead.original_price != null
      ? lead.original_price - (lead.discount ?? 0)
      : 0;
  const balance = sellingPrice - (lead.amount_paid ?? 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-white">{lead.name}</h1>
          {lead.leadType === "on_plan" && (
            <span className="badge bg-emerald-600/80 text-sm" title={lead.planExpiry ? `Expires ${lead.planExpiry}` : ""}>
              On plan{lead.activePlanName ? ` · ${lead.activePlanName}` : ""}{lead.planExpiry ? ` · ${lead.planExpiry}` : ""}
              {lead.activeOpsCoordinator && <span className="text-slate-300 ml-1">· Ops: {lead.activeOpsCoordinator}</span>}
            </span>
          )}
          {lead.leadType === "existing_customer" && (
            <span className="badge bg-slate-500 text-sm">Existing customer</span>
          )}
        </div>
        <button type="button" onClick={() => router.push("/leads")} className="btn-ghost text-slate-400">← Back</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">Contact</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">City *</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="input text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Company</label>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="input text-sm" placeholder="-" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Phone</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="input text-sm" placeholder="-" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input text-sm" placeholder="-" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Insta ID</label>
              <input type="text" value={instaId} onChange={(e) => setInstaId(e.target.value)} className="input text-sm" placeholder="-" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">BDM</label>
              <select value={bdm} onChange={(e) => setBdm(e.target.value)} className="input text-sm">
                <option value="">Select</option>
                {(dropdowns?.bdms ?? []).map((b: string) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Last modified: {lead.last_modified ? new Date(lead.last_modified).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</p>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">Payment (read-only)</h2>
          <p className="text-sm text-slate-400">Record payments in Payment Pending tab</p>
          <dl className="mt-2 space-y-2 text-sm">
            <div><dt className="text-slate-400">Selling Price</dt><dd>₹{sellingPrice?.toLocaleString() ?? 0}</dd></div>
            <div><dt className="text-slate-400">Amount Paid</dt><dd>₹{lead.amount_paid?.toLocaleString() ?? 0}</dd></div>
            <div><dt className="text-slate-400">Amount to Pay</dt><dd className={balance === 0 ? "text-emerald-400" : ""}>₹{Math.max(0, balance)?.toLocaleString() ?? 0}{balance === 0 ? " (paid)" : ""}</dd></div>
            <div><dt className="text-slate-400">Mode</dt><dd>{lead.payment_mode || "-"}</dd></div>
          </dl>
        </div>
      </div>
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">Edit (mandatory: Status, Remarks, Next connect)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input">
              <option value="">—</option>
              {((dropdowns?.plans ?? []) as { name?: string; active?: boolean }[]).filter((p) => p.active !== false || p?.name === plan).map((p) => {
                const n = p?.name ?? "";
                return n ? <option key={n} value={n}>{n}{p.active === false ? " (inactive)" : ""}</option> : null;
              })}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Connected On</label>
            <input
              type="date"
              value={connectedOn}
              onChange={(e) => setConnectedOn(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input"
            >
              {["UNTOUCHED", "CONTACTED", "FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID", "PAID", "DENIED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              Next Follow Up{(status === "FOLLOW UP/DETAILS SHARED" || status === "CONFIRMED" || status === "PARTLY_PAID") && " *"}
            </label>
            <input
              type="date"
              value={nextFollowUp}
              onChange={(e) => setNextFollowUp(e.target.value)}
              className="input"
            />
          </div>
          {(status === "CONFIRMED" || status === "PARTLY_PAID" || status === "PAID") && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Committed Date</label>
              <input
                type="date"
                value={committedDate}
                onChange={(e) => setCommittedDate(e.target.value)}
                className="input"
              />
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Original Price (₹)</label>
            <input
              type="number"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              className="input"
              placeholder="e.g. 18000"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Discount (₹)</label>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="input"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Final Price (₹)</label>
            <p className="rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2 text-emerald-400 font-medium">
              ₹{Math.max(0, (Number(originalPrice) || 0) - (Number(discount) || 0)).toLocaleString()}
            </p>
          </div>
        </div>
        {status === "DENIED" && (
          <div className="mt-4">
            <label className="mb-1 block text-sm text-slate-400">Lost reason *</label>
            <input
              type="text"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="input"
              placeholder="e.g. Budget, competitor, no response"
            />
          </div>
        )}
        <div className="mt-4">
          <label className="mb-1 block text-sm text-slate-400">Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="input min-h-[80px]"
            rows={3}
          />
        </div>
        {saveError && <p className="mt-2 text-red-400 text-sm">{saveError}</p>}
        <button onClick={handleSave} className="btn-primary mt-4" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {showSubsAndRenewals && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-white">Subscriptions & Renewals</h2>
          <SubscriptionsForLead
            leadId={id}
            lead={lead}
            customer={lead.customer}
            subscriptions={subscriptions}
            renewalDeals={renewalDeals}
            mutateSubs={mutateSubs}
            mutateRenewals={mutateRenewals}
            dropdowns={dropdowns}
          />
        </div>
      )}
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">Tasks</h2>
        <TasksForLead
          leadId={id}
          leadName={lead.name}
          bdm={lead.bdm}
          leadStatus={status}
          mutateLead={mutate}
          renewalDeals={renewalDeals}
          mutateRenewals={mutateRenewals}
        />
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">Activity</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {activity.length === 0 && <p className="text-slate-400 text-sm">No activity yet</p>}
          {activity.map((a: { id: string; date: string; time?: string; action: string; notes?: string; user?: string }) => (
            <div key={a.id} className="rounded bg-slate-700/50 p-2 text-sm">
              <span className="text-slate-400">{a.date} {a.time}</span> – {a.action}
              {a.user && <span className="text-slate-500"> by {a.user}</span>}
              {a.notes && <p className="mt-1 text-slate-300">{a.notes}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
