"use client";

import { useState } from "react";
import { AIChatPanel } from "@/components/sales/AIChatPanel";
import { Button } from "@/components/ui/Button";

export default function SalesAiPage() {
  const [loading, setLoading] = useState(false);
  const [dailyPlan, setDailyPlan] = useState<string>("");

  async function generateDayPlan() {
    setLoading(true);
    const res = await fetch("/api/sales/ai/day-plan", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { data?: { reply?: string }; error?: string };
    setDailyPlan(json.data?.reply ?? json.error ?? "No plan generated.");
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-brand">AI Daily Plan</p>
          <Button onClick={() => void generateDayPlan()} disabled={loading}>
            {loading ? "Generating..." : "Generate my day plan"}
          </Button>
        </div>
        {dailyPlan ? <pre className="whitespace-pre-wrap text-xs text-slate-700">{dailyPlan}</pre> : <p className="text-xs text-slate-muted">Create a plan from your current tasks and pipeline DB context.</p>}
      </div>
      <AIChatPanel />
    </div>
  );
}
