"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CommissionMuaListItem } from "@/app/api/commission/muas/route";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { formatRegions, REGION_OPTIONS } from "@/lib/mua-region";
import type { PlanTier, Region } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

function CapBar({ used, cap }: { used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const color =
    pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex min-w-[90px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-[10px] text-slate-muted">
        {used}/{cap || "—"}
      </span>
    </div>
  );
}

type Props = {
  title?: string;
  subtitle?: string;
  detailBasePath: string;
};

export function MuaDatabaseClient({
  title = "MUA Database",
  subtitle = "Browse Olready MUAs (read-only)",
  detailBasePath,
}: Props) {
  const [muas, setMuas] = useState<CommissionMuaListItem[]>([]);
  const [regionFilter, setRegionFilter] = useState<Region[]>([]);
  const [tierFilter, setTierFilter] = useState<PlanTier | "">("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (availableOnly) params.set("availableOnly", "true");
    if (tierFilter) params.set("tier", tierFilter);
    if (q.trim()) params.set("q", q.trim());
    regionFilter.forEach((r) => params.append("region", r));
    void fetch(`/api/commission/muas?${params}`)
      .then((r) => r.json())
      .then((json: { data: PaginatedResult<CommissionMuaListItem> | null }) => {
        setMuas(json.data?.data ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, tierFilter, availableOnly]);

  const filteredMuas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return muas;
    return muas.filter(
      (m) =>
        m.name.toLowerCase().includes(needle) ||
        m.city?.toLowerCase().includes(needle) ||
        m.displayId?.toLowerCase().includes(needle)
    );
  }, [muas, q]);

  function toggleRegion(r: Region) {
    setRegionFilter((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">{title}</h1>
        <p className="text-sm text-slate-muted">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, city, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs font-medium text-slate-muted">Region:</span>
        <button
          type="button"
          onClick={() => setRegionFilter([])}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            regionFilter.length === 0
              ? "border-accent bg-accent text-white"
              : "border-slate-200 bg-white"
          )}
        >
          All
        </button>
        {REGION_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggleRegion(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              regionFilter.includes(value)
                ? "border-accent bg-accent text-white"
                : "border-slate-200 bg-white"
            )}
          >
            {label}
          </button>
        ))}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
          />
          Available this week
        </label>
      </div>

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>City</TH>
              <TH>Region</TH>
              <TH>Plan</TH>
              <TH>Cap</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {filteredMuas.length === 0 ? (
              <TR>
                <TD colSpan={6} className="text-center text-slate-muted">
                  No MUAs found
                </TD>
              </TR>
            ) : (
              filteredMuas.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">{m.name}</TD>
                  <TD>{m.city}</TD>
                  <TD className="text-xs">{formatRegions(m.regions)}</TD>
                  <TD>
                    {m.planTier ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          PLAN_BADGE[m.planTier]
                        )}
                      >
                        {PLAN_TIER_LABELS[m.planTier]}
                      </span>
                    ) : (
                      <Badge variant="muted">Non-plan</Badge>
                    )}
                  </TD>
                  <TD>
                    <CapBar used={m.weeklyUsed} cap={m.weeklyCap} />
                  </TD>
                  <TD>
                    <Link
                      href={`${detailBasePath}/${m.id}`}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      View
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}
    </div>
  );
}
