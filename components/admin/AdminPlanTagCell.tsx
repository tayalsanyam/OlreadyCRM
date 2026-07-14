"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  ADMIN_PLAN_TAG_LABELS,
  ADMIN_PLAN_TAG_OPTIONS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { cn } from "@/lib/utils";

const TAG_BADGE: Record<AdminPlanTag, string> = {
  high_priority: "bg-red-100 text-red-800",
  low_priority: "bg-slate-100 text-slate-600",
  hold: "bg-amber-100 text-amber-900",
};

export function AdminPlanTagCell({
  muaId,
  tag,
  onUpdated,
}: {
  muaId: string;
  tag: AdminPlanTag | null;
  onUpdated: (tag: AdminPlanTag | null) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onChange(next: string) {
    const adminPlanTag = next === "" ? null : (next as AdminPlanTag);
    if (adminPlanTag === tag) return;

    const previous = tag;
    onUpdated(adminPlanTag);
    setSaving(true);

    const res = await fetch(`/api/admin/muas/${muaId}/plan-controls`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminPlanTag }),
    });
    const json = (await res.json()) as { error?: string };
    setSaving(false);

    if (!res.ok) {
      onUpdated(previous);
      toast(json.error ?? "Could not update admin tag", "error");
      return;
    }

    toast("Admin tag updated");
  }

  return (
    <select
      value={tag ?? ""}
      disabled={saving}
      onChange={(e) => void onChange(e.target.value)}
      aria-label="Admin plan tag"
      className={cn(
        "max-w-[9.5rem] rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium",
        tag ? TAG_BADGE[tag] : "bg-white text-slate-600",
        saving && "cursor-wait opacity-60"
      )}
    >
      <option value="">No tag</option>
      {ADMIN_PLAN_TAG_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {ADMIN_PLAN_TAG_LABELS[t]}
        </option>
      ))}
    </select>
  );
}
