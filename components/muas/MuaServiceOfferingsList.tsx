"use client";

import type { MuaServiceOffering } from "@/lib/mua-service-catalog";

export function MuaServiceOfferingsList({
  offerings,
  fallbackNames,
}: {
  offerings?: MuaServiceOffering[] | null;
  fallbackNames?: string[] | null;
}) {
  const list =
    offerings?.length
      ? offerings
      : (fallbackNames ?? []).map((name) => ({ name, baseAmount: null as number | null }));

  if (!list.length) {
    return <span className="text-slate-muted">—</span>;
  }

  return (
    <ul className="space-y-1 text-sm text-slate-700">
      {list.map((o) => (
        <li key={o.name} className="flex flex-wrap items-baseline gap-2">
          <span>{o.name}</span>
          {o.baseAmount != null ? (
            <span className="text-xs text-slate-muted">
              ref ₹{o.baseAmount.toLocaleString("en-IN")}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
