"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { LeadFull } from "@/lib/types";

interface CommissionFollowUpPanelProps {
  lead: LeadFull;
  onUpdated: () => void;
}

export function CommissionFollowUpPanel({
  lead,
  onUpdated,
}: CommissionFollowUpPanelProps) {
  const { toast } = useToast();
  const locked = lead.status === "booked";
  const [offered, setOffered] = useState(
    lead.commissionOffered != null ? String(lead.commissionOffered) : ""
  );
  const [agreed, setAgreed] = useState(
    lead.commissionAgreed != null ? String(lead.commissionAgreed) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOffered(
      lead.commissionOffered != null ? String(lead.commissionOffered) : ""
    );
    setAgreed(lead.commissionAgreed != null ? String(lead.commissionAgreed) : "");
  }, [lead.commissionOffered, lead.commissionAgreed]);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/commission`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionOffered: offered.trim() ? Number(offered) : null,
        commissionAgreed: agreed.trim() ? Number(agreed) : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Commission follow-up saved");
      onUpdated();
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Save failed", "error");
    }
  }

  return (
    <Card className="space-y-4 border-dashed border-accent/40 bg-accent/5">
      <div>
        <h3 className="text-sm font-semibold text-brand">Commission follow-up</h3>
        <p className="text-xs text-slate-muted">
          Record commission offered and agreed during follow-up. Editable until
          booking is confirmed.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Commission offered (Rs.)"
          type="number"
          min={0}
          disabled={locked}
          value={offered}
          onChange={(e) => setOffered(e.target.value)}
        />
        <Input
          label="Commission agreed (Rs.)"
          type="number"
          min={0}
          disabled={locked}
          value={agreed}
          onChange={(e) => setAgreed(e.target.value)}
        />
      </div>
      {locked ? (
        <p className="text-xs text-amber-700">Locked — booking confirmed.</p>
      ) : (
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save commission follow-up"}
        </Button>
      )}
    </Card>
  );
}
