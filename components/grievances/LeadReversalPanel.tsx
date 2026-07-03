"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";

type Review = {
  leadsRequested: number;
  leadsApproved: number | null;
  decision: string | null;
  decisionReason: string | null;
};

type Props = {
  ticketId: string;
  category: string;
  isAdmin?: boolean;
};

export function LeadReversalPanel({ ticketId, category, isAdmin }: Props) {
  const { toast } = useToast();
  const [review, setReview] = useState<Review | null>(null);
  const [leadsRequested, setLeadsRequested] = useState("0");
  const [leadsApproved, setLeadsApproved] = useState("");
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    void fetch(`/api/crm/tickets/${ticketId}/lead-reversal`)
      .then((r) => r.json())
      .then((json) => {
        const r = json.data as Review | null;
        if (r) {
          setReview(r);
          setLeadsRequested(String(r.leadsRequested));
          setLeadsApproved(r.leadsApproved != null ? String(r.leadsApproved) : "");
          setDecision(r.decision ?? "");
          setReason(r.decisionReason ?? "");
        }
      });
  }, [ticketId]);

  useEffect(() => {
    if (category === "lead_reversal") load();
  }, [category, load]);

  if (category !== "lead_reversal") return null;

  const save = async () => {
    const res = await fetch(`/api/crm/tickets/${ticketId}/lead-reversal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadsRequested: Number(leadsRequested) || 0,
        leadsApproved: leadsApproved ? Number(leadsApproved) : null,
        decision: decision || null,
        decisionReason: reason || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast(json.error ?? "Save failed", "error");
      return;
    }
    toast("Lead reversal review saved");
    load();
  };

  return (
    <Card className="space-y-4 p-4">
      <h3 className="font-semibold text-brand">Lead reversal review</h3>
      <Input
        label="Leads requested"
        type="number"
        value={leadsRequested}
        onChange={(e) => setLeadsRequested(e.target.value)}
      />
      <Input
        label="Leads approved"
        type="number"
        value={leadsApproved}
        onChange={(e) => setLeadsApproved(e.target.value)}
        disabled={!isAdmin}
      />
      <Select
        label="Decision"
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        disabled={!isAdmin}
        options={[
          { value: "", label: "Pending…" },
          { value: "approved", label: "Approved" },
          { value: "partial", label: "Partial" },
          { value: "rejected", label: "Rejected" },
        ]}
      />
      <div>
        <label className="mb-1 block text-sm font-medium">Reason</label>
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={!isAdmin}
        />
      </div>
      <Button onClick={save}>{isAdmin ? "Save decision" : "Update request"}</Button>
      {review?.decision && (
        <p className="text-sm text-slate-muted capitalize">Current: {review.decision}</p>
      )}
    </Card>
  );
}
