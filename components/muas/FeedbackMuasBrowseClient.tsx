"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CommissionMuaListItem } from "@/app/api/commission/muas/route";
import {
  CommissionMuasFiltersBar,
  type CommissionMuasFiltersState,
} from "@/components/commission/CommissionMuasFiltersBar";
import { Badge } from "@/components/ui/Badge";
import { CapBar } from "@/components/muas/CapBar";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cityPickerLabels } from "@/lib/city-catalog";
import {
  ADMIN_PLAN_TAG_LABELS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { formatRegions } from "@/lib/mua-region";
import type { PlanTier } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";
import { cn } from "@/lib/utils";

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

const TAG_BADGE: Record<AdminPlanTag, string> = {
  high_priority: "bg-red-100 text-red-800",
  low_priority: "bg-slate-100 text-slate-700",
  hold: "bg-amber-100 text-amber-900",
};

const DEFAULT_FILTERS: CommissionMuasFiltersState = {
  search: "",
  region: [],
  tier: "",
  expiry: "all",
  city: "",
  adminTag: "all",
  pushedFrom: "",
  pushedTo: "",
  availableOnly: false,
};

export function FeedbackMuasBrowseClient({
  detailBasePath = "/feedback/muas",
}: {
  detailBasePath?: string;
}) {
  const [muas, setMuas] = useState<CommissionMuaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<CommissionMuasFiltersState>(DEFAULT_FILTERS);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/cities")
      .then((r) => r.json())
      .then((json: { data?: Array<{ city: string }> | null }) => {
        setCityOptions(cityPickerLabels((json.data ?? []) as Parameters<typeof cityPickerLabels>[0]));
      })
      .catch(() => setCityOptions([]));
  }, []);

  const load = useCallback((p: number, f: CommissionMuasFiltersState) => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({
      page: String(p),
      pageSize: "50",
    });
    if (f.search.trim()) params.set("q", f.search.trim());
    if (f.tier) params.set("tier", f.tier);
    if (f.expiry !== "all") params.set("expiry", f.expiry);
    if (f.city) params.set("city", f.city);
    if (f.adminTag !== "all") params.set("adminTag", f.adminTag);
    if (f.pushedFrom) params.set("pushedFrom", f.pushedFrom);
    if (f.pushedTo) params.set("pushedTo", f.pushedTo);
    if (f.availableOnly) params.set("availableOnly", "true");
    f.region.forEach((r) => params.append("region", r));

    void fetch(`/api/commission/muas?${params}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          data: PaginatedResult<CommissionMuaListItem> | null;
          error?: string | null;
        };
        if (!r.ok) throw new Error(json.error ?? "Failed to load MUAs");
        return json;
      })
      .then((json) => {
        setMuas(json.data?.data ?? []);
        setTotal(json.data?.total ?? 0);
        setPage(json.data?.page ?? p);
        setTotalPages(json.data?.totalPages ?? 1);
      })
      .catch((err: unknown) => {
        setMuas([]);
        setTotal(0);
        setLoadError(err instanceof Error ? err.message : "Failed to load MUAs");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">MUA Database</h1>
        <p className="text-sm text-slate-muted">
          Browse Olready MUAs — lookup only, no pushing from here.
        </p>
      </div>

      <CommissionMuasFiltersBar
        filters={filters}
        cityOptions={cityOptions}
        onChange={setFilters}
        onApply={(next) => load(1, next)}
      />

      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      <p className="text-xs text-slate-muted">
        {loading ? "Loading…" : `${total} MUA${total === 1 ? "" : "s"}`}
        {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
      </p>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>City</TH>
              <TH>Region</TH>
              <TH>Plan</TH>
              <TH>Tag</TH>
              <TH>Cap</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {muas.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-slate-muted">
                  No MUAs match these filters
                </TD>
              </TR>
            ) : (
              muas.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="font-medium">{m.name}</div>
                    <div className="font-mono text-[10px] text-slate-muted">{m.displayId}</div>
                  </TD>
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
                    {m.adminPlanTag ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          TAG_BADGE[m.adminPlanTag]
                        )}
                      >
                        {ADMIN_PLAN_TAG_LABELS[m.adminPlanTag]}
                      </span>
                    ) : (
                      "—"
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
                      Details
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}

      {totalPages > 1 && !loading ? (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => load(page - 1, filters)}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => load(page + 1, filters)}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
