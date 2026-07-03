"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import type { MuaServiceOffering } from "@/lib/mua-service-catalog";

type CatalogItem = {
  id: string;
  name: string;
  baseAmount: number | null;
};

export function MuaServicesPicker({
  value,
  onChange,
}: {
  value: MuaServiceOffering[];
  onChange: (next: MuaServiceOffering[]) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  useEffect(() => {
    void fetch("/api/mua-services")
      .then((r) => r.json())
      .then((j: { data?: CatalogItem[] }) => setCatalog(j.data ?? []));
  }, []);

  function toggle(item: CatalogItem, checked: boolean) {
    if (checked) {
      onChange([
        ...value,
        {
          catalogId: item.id,
          name: item.name,
          baseAmount: item.baseAmount,
        },
      ]);
    } else {
      onChange(value.filter((v) => v.catalogId !== item.id && v.name !== item.name));
    }
  }

  function updateAmount(catalogId: string, name: string, raw: string) {
    const baseAmount = raw.trim() === "" ? null : Number(raw);
    onChange(
      value.map((v) =>
        v.catalogId === catalogId || v.name === name
          ? { ...v, baseAmount: Number.isFinite(baseAmount) ? baseAmount : null }
          : v
      )
    );
  }

  function isSelected(item: CatalogItem) {
    return value.some((v) => v.catalogId === item.id || v.name === item.name);
  }

  function selectedOffering(item: CatalogItem) {
    return value.find((v) => v.catalogId === item.id || v.name === item.name);
  }

  if (!catalog.length) {
    return <p className="text-sm text-slate-muted">Loading services…</p>;
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-text">Services offered</span>
      <p className="text-xs text-slate-muted">
        Reference base amounts — editable here and on the MUA profile as you learn more.
      </p>
      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
        {catalog.map((item) => {
          const selected = isSelected(item);
          const offering = selectedOffering(item);
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex min-w-[180px] flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => toggle(item, e.target.checked)}
                />
                <span>{item.name}</span>
              </label>
              {selected ? (
                <Input
                  className="w-28"
                  type="number"
                  min={0}
                  placeholder="Base ₹"
                  value={offering?.baseAmount ?? ""}
                  onChange={(e) => updateAmount(item.id, item.name, e.target.value)}
                />
              ) : item.baseAmount != null ? (
                <span className="text-xs text-slate-muted">Ref ₹{item.baseAmount.toLocaleString("en-IN")}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
