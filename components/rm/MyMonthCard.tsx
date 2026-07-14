"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { currentMonthKey } from "@/lib/targets";
import { cn } from "@/lib/utils";

interface MyTargets {
  targetBookings: number | null;
  targetLeadsWorked: number | null;
  targetAvgMuasPerLead: number | null;
  actualBookings: number;
  actualLeadsWorked: number;
  actualAvgMuasPerLead: number;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function fmt(actual: number, target: number | null, label: string) {
  const t = target != null ? ` / ${target} target` : "";
  return (
    <span>
      <span className="text-slate-muted">{label}: </span>
      <span className="font-semibold text-brand">
        {actual}
        {t}
      </span>
    </span>
  );
}

export function MyMonthCard() {
  const [data, setData] = useState<MyTargets | null>(null);
  const monthKey = currentMonthKey();
  const monthLabel = formatMonthLabel(monthKey);

  useEffect(() => {
    void fetch("/api/rm/targets/me")
      .then((r) => r.json())
      .then((json: { data: MyTargets }) => setData(json.data));
  }, []);

  if (!data) return null;

  const hasTargets =
    data.targetBookings != null ||
    data.targetLeadsWorked != null ||
    data.targetAvgMuasPerLead != null;

  if (!hasTargets && data.actualBookings === 0 && data.actualLeadsWorked === 0) {
    return null;
  }

  return (
    <Card className="mb-4 border-brand/20 bg-brand/5 px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-muted">
        My month · {monthLabel}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {fmt(data.actualBookings, data.targetBookings, "Bookings")}
        <span className="text-slate-300">|</span>
        {fmt(data.actualLeadsWorked, data.targetLeadsWorked, "Leads worked")}
        <span className="text-slate-300">|</span>
        <span>
          <span className="text-slate-muted">Avg MUAs: </span>
          <span
            className={cn(
              "font-semibold",
              data.targetAvgMuasPerLead != null &&
                data.actualAvgMuasPerLead >= data.targetAvgMuasPerLead
                ? "text-emerald-600"
                : "text-brand"
            )}
          >
            {data.actualAvgMuasPerLead}
            {data.targetAvgMuasPerLead != null
              ? ` / ${data.targetAvgMuasPerLead}`
              : ""}
          </span>
        </span>
      </div>
    </Card>
  );
}
