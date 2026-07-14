"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

function isValidOlreadyProfileLink(link: string): boolean {
  try {
    const parsed = new URL(link.trim());
    if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) return false;
    return parsed.hostname.includes("olready.in");
  } catch {
    return false;
  }
}

export function TrainingChecklist({
  pipelineId,
  initial,
  checklistReady,
  sendBackNote,
  onSaved,
}: {
  pipelineId: string;
  initial?: Record<string, unknown> | null;
  checklistReady: boolean;
  sendBackNote?: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [profileLink, setProfileLink] = useState(String(initial?.profileLink ?? ""));
  const [steps, setSteps] = useState({
    stepLeadUnlock: Boolean(initial?.stepLeadUnlock),
    stepLeadBudget: Boolean(initial?.stepLeadBudget),
    stepLeadReversal: Boolean(initial?.stepLeadReversal),
    stepRoleOfRm: Boolean(initial?.stepRoleOfRm),
    stepRmContact: Boolean(initial?.stepRmContact),
    stepLeadViews: Boolean(initial?.stepLeadViews),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProfileLink(String(initial?.profileLink ?? ""));
    setSteps({
      stepLeadUnlock: Boolean(initial?.stepLeadUnlock),
      stepLeadBudget: Boolean(initial?.stepLeadBudget),
      stepLeadReversal: Boolean(initial?.stepLeadReversal),
      stepRoleOfRm: Boolean(initial?.stepRoleOfRm),
      stepRmContact: Boolean(initial?.stepRmContact),
      stepLeadViews: Boolean(initial?.stepLeadViews),
    });
  }, [initial]);

  const progress = useMemo(() => Object.values(steps).filter(Boolean).length, [steps]);
  const allStepsChecked = progress === 6;
  const linkValid = profileLink.trim() ? isValidOlreadyProfileLink(profileLink) : false;
  const canComplete = allStepsChecked && linkValid;

  async function save() {
    if (!profileLink.trim()) {
      toast("Profile link is required", "error");
      return;
    }
    if (!isValidOlreadyProfileLink(profileLink)) {
      toast("Profile link must be a valid olready.in URL", "error");
      return;
    }
    if (!allStepsChecked) {
      toast("Tick all 6 training steps before saving", "error");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/sales/pipeline/${pipelineId}/training`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileLink: profileLink.trim(), ...steps }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { complete?: boolean; stageAdvanced?: boolean; pipelineStage?: string };
      };
      if (!res.ok) {
        toast(json.error ?? "Could not save training", "error");
        return;
      }
      if (json.data?.complete) {
        if (json.data.stageAdvanced || json.data.pipelineStage === "Deal Closed") {
          toast(
            sendBackNote
              ? "Training fixed — sent back to activation (continues from prior progress)"
              : "Training complete — onboarding task closed and deal moved to Deal Closed",
          );
        } else if (json.data.pipelineStage === "Onboarding") {
          toast("Training saved but stage did not advance — contact support", "error");
        } else {
          toast("Training complete");
        }
      } else {
        toast("Training saved — complete all steps and a valid profile link to finish", "error");
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  if (!checklistReady) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-muted">
        Complete Checklist 1 and Checklist 2 first.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-brand">Training Checklist</p>
      {sendBackNote ? (
        <p className="text-xs text-amber-900">
          Activation asked for fixes: <span className="font-medium">{sendBackNote}</span>
        </p>
      ) : null}
      <p className="text-xs text-slate-muted">
        {progress} of 6 steps complete
        {canComplete ? " · Ready to finish" : ""}
      </p>
      <Input
        label="Profile Link *"
        value={profileLink}
        onChange={(e) => setProfileLink(e.target.value)}
        placeholder="https://olready.in/..."
      />
      {profileLink.trim() && !linkValid ? (
        <p className="text-xs text-danger">Enter a valid olready.in profile URL (https://…)</p>
      ) : null}
      {[
        ["stepLeadUnlock", "Lead Unlock explained"],
        ["stepLeadBudget", "Lead Budget Check explained"],
        ["stepLeadReversal", "Lead Reversal explained"],
        ["stepRoleOfRm", "Role of RM explained"],
        ["stepRmContact", "RM Contact shared"],
        ["stepLeadViews", "Lead Views shown"],
      ].map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={Boolean((steps as Record<string, boolean>)[k])}
            onChange={(e) => setSteps((s) => ({ ...s, [k]: e.target.checked }))}
          />
          {label}
        </label>
      ))}
      <Button onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save Training"}
      </Button>
    </div>
  );
}
