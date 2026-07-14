"use client";

import { Input } from "@/components/ui/Input";
import { PLAN_OPTIONS, type PlanSharedRow } from "@/lib/sales-plan-details";

export function PlansSharedEditor({
  value,
  onChange,
}: {
  value: PlanSharedRow[];
  onChange: (rows: PlanSharedRow[]) => void;
}) {
  function togglePlan(plan: string) {
    if (value.some((r) => r.plan === plan)) {
      onChange(value.filter((r) => r.plan !== plan));
    } else {
      onChange([...value, { plan, amount: 0 }]);
    }
  }

  function setAmount(plan: string, amount: string) {
    onChange(
      value.map((r) => (r.plan === plan ? { ...r, amount: Number(amount) || 0 } : r)),
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <p className="text-sm font-semibold text-brand">Plans & amounts shared *</p>
      <p className="text-xs text-slate-muted">Select each plan discussed and enter the amount quoted for that plan.</p>
      <div className="flex flex-wrap gap-2">
        {PLAN_OPTIONS.map((plan) => {
          const selected = value.some((r) => r.plan === plan);
          return (
            <button
              key={plan}
              type="button"
              onClick={() => togglePlan(plan)}
              className={`rounded-full px-3 py-1 text-xs ${selected ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {plan}
            </button>
          );
        })}
      </div>
      {value.length > 0 ? (
        <div className="space-y-2">
          {value.map((row) => (
            <div key={row.plan} className="flex items-end gap-2">
              <p className="min-w-[5rem] pb-2 text-sm font-medium text-slate-700">{row.plan}</p>
              <Input
                label="Amount (INR)"
                type="number"
                value={row.amount > 0 ? String(row.amount) : ""}
                onChange={(e) => setAmount(row.plan, e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-700">Select at least one plan.</p>
      )}
    </div>
  );
}
