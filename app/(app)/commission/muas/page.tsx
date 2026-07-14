"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CommissionMuaListItem } from "@/app/api/commission/muas/route";
import {
  CommissionMuasFiltersBar,
  type CommissionMuasFiltersState,
} from "@/components/commission/CommissionMuasFiltersBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectLeadModal } from "@/components/muas/SelectLeadModal";
import { CapBar } from "@/components/muas/CapBar";
import { MuaQuickContact } from "@/components/muas/MuaQuickContact";
import { PushMuaSlideOver } from "@/components/leads/PushMuaSlideOver";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cityPickerLabels } from "@/lib/city-catalog";
import {
  ADMIN_PLAN_TAG_LABELS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { formatRegions } from "@/lib/mua-region";
import type { LeadEvent, LeadFull, PlanTier } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";
import { cn, formatDate } from "@/lib/utils";

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

export default function CommissionMuasPage() {
  const [muas, setMuas] = useState<CommissionMuaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<CommissionMuasFiltersState>(DEFAULT_FILTERS);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pushMuaId, setPushMuaId] = useState<string | null>(null);
  const [selectLeadOpen, setSelectLeadOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushLead, setPushLead] = useState<LeadFull | null>(null);
  const [pushEvents, setPushEvents] = useState<LeadEvent[]>([]);

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
        const text = await r.text();
        if (!text) {
          throw new Error(`Empty response (${r.status})`);
        }
        const json = JSON.parse(text) as {
          data: PaginatedResult<CommissionMuaListItem> | null;
          error?: string | null;
        };
        if (!r.ok) {
          throw new Error(json.error ?? `Request failed (${r.status})`);
        }
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
    load(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLeadSelected(lead: LeadFull) {
    setPushLead(lead);
    const res = await fetch(`/api/leads/${lead.id}`);
    const json = (await res.json()) as { data: { events: LeadEvent[] } | null };
    setPushEvents(json.data?.events ?? []);
    setPushOpen(true);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand">MUA Database</h1>
        <p className="mt-1 text-sm text-slate-muted">
          All active pipeline MUAs across India — search, filter, and push to commission
          leads. Region filters are optional.
        </p>
      </div>

      <CommissionMuasFiltersBar
        filters={filters}
        cityOptions={cityOptions}
        onChange={setFilters}
        onApply={(next) => load(1, next)}
      />

      <Card className="overflow-hidden p-0">
        {loadError ? (
          <p className="px-4 py-10 text-center text-sm text-red-600">{loadError}</p>
        ) : loading ? (
          <div className="h-40 animate-pulse bg-slate-100" />
        ) : muas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-muted">
            No MUAs match your filters. Try clearing filters or broadening search.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>MUA</TH>
                  <TH>Contact</TH>
                  <TH>City</TH>
                  <TH>Region</TH>
                  <TH>Plan</TH>
                  <TH>Tag</TH>
                  <TH>Weekly cap</TH>
                  <TH>Bookings</TH>
                  <TH>Last pushed</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {muas.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <div className="font-medium text-brand">{m.name}</div>
                    </TD>
                    <TD>
                      <MuaQuickContact
                        muaId={m.id}
                        muaName={m.name}
                        muaPhone={m.phone}
                        muaWhatsapp={m.whatsapp}
                        muaCity={m.city}
                        pipelineId={m.salesPipelineId}
                        layout="stacked"
                        variant="compact"
                      />
                    </TD>
                    <TD className="text-sm">{m.city}</TD>
                    <TD className="text-xs text-slate-muted">
                      {formatRegions(m.regions)}
                    </TD>
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
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            TAG_BADGE[m.adminPlanTag]
                          )}
                        >
                          {ADMIN_PLAN_TAG_LABELS[m.adminPlanTag]}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-muted">—</span>
                      )}
                    </TD>
                    <TD>
                      <CapBar used={m.weeklyUsed} cap={m.weeklyCap} />
                    </TD>
                    <TD className="tabular-nums text-sm">{m.totalBookings}</TD>
                    <TD className="text-xs text-slate-muted">
                      {m.lastPushed ? formatDate(m.lastPushed.slice(0, 10)) : "Never"}
                    </TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/commission/muas/${m.id}`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          className="text-left text-xs font-medium text-brand hover:underline"
                          onClick={() => {
                            setPushMuaId(m.id);
                            setSelectLeadOpen(true);
                          }}
                        >
                          Push to lead
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-muted">
        <span>
          {total === 0
            ? "No results"
            : `Showing ${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total}`}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1, filters)}
          >
            Previous
          </Button>
          <span className="self-center text-xs tabular-nums">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1, filters)}
          >
            Next
          </Button>
        </div>
      </div>

      <SelectLeadModal
        open={selectLeadOpen}
        onClose={() => setSelectLeadOpen(false)}
        queueStatus="commissionRm"
        onSelect={(lead) => void handleLeadSelected(lead)}
      />

      {pushLead && pushMuaId && (
        <PushMuaSlideOver
          open={pushOpen}
          onClose={() => setPushOpen(false)}
          leadId={pushLead.id}
          urgencyBand={pushLead.urgencyBand}
          events={pushEvents}
          commissionMode
          preselectedMuaId={pushMuaId}
          onPushed={() => {
            setPushOpen(false);
            load(page, filters);
          }}
        />
      )}
    </div>
  );
}
