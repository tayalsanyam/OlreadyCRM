"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { PlanDetailsFields } from "@/components/sales/PlanDetailsFields";
import {
  mapOnboardingRow,
  planDetailsFromOnboarding,
  type SalesPlanDetailsInput,
} from "@/lib/sales-plan-details";

import type { Region } from "@/lib/types";

export function OnboardingChecklist2({
  pipelineId,
  initial,
  artistCity,
  artistRegions,
  onSaved,
}: {
  pipelineId: string;
  initial?: Record<string, unknown> | null;
  artistCity?: string;
  artistRegions?: Region[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [planDetails, setPlanDetails] = useState<SalesPlanDetailsInput>(() =>
    planDetailsFromOnboarding(mapOnboardingRow(initial)),
  );
  const [busy, setBusy] = useState(false);
  const initialVersion = String(initial?.updated_at ?? initial?.updatedAt ?? "");

  useEffect(() => {
    setPlanDetails(planDetailsFromOnboarding(mapOnboardingRow(initial)));
  }, [pipelineId, initialVersion]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/pipeline/${pipelineId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planDetails),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(json.error ?? "Could not save Checklist 2", "error");
        return;
      }
      toast("Checklist 2 saved");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-brand">Checklist 2 — Plan Details</p>
      <PlanDetailsFields
        artistCity={artistCity}
        artistRegions={artistRegions}
        value={planDetails}
        showDealConfirmFields
        onChange={setPlanDetails}
      />
      <Button onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save Checklist 2"}
      </Button>
    </div>
  );
}
