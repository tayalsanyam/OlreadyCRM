"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RmQueueClient } from "@/app/(app)/rm/queue/RmQueueClient";
import { LeadCard } from "@/components/leads/LeadCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { BudgetTier, LeadFull, Region, UrgencyBand } from "@/lib/types";
import { BUDGET_TIER_LABELS, URGENCY_LABELS } from "@/lib/types";

type Tab = "queue" | "portal";

const REGIONS: Region[] = ["north", "east", "west", "south"];
const URGENCY_OPTIONS: UrgencyBand[] = [
  "critical",
  "hot",
  "active",
  "longShelf",
];
const TIER_OPTIONS: BudgetTier[] = ["tier1", "tier2", "tier3", "tier4"];

export default function CommissionQueuePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("queue");
  const [portalLeads, setPortalLeads] = useState<LeadFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<BudgetTier | "">("");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyBand | "">("");
  const [regionFilter, setRegionFilter] = useState<Region | "">("");

  const loadPortal = useCallback(() => {
    return fetch("/api/commission/portal-leads")
      .then((r) => r.json())
      .then((json: { data: LeadFull[] | null }) => {
        setPortalLeads(json.data ?? []);
      });
  }, []);

  useEffect(() => {
    if (tab !== "portal") return;
    setLoading(true);
    void loadPortal().finally(() => setLoading(false));
  }, [tab, loadPortal]);

  const filteredPortal = useMemo(() => {
    return portalLeads.filter((l) => {
      if (tierFilter && l.budgetTier !== tierFilter) return false;
      if (urgencyFilter && l.urgencyBand !== urgencyFilter) return false;
      if (regionFilter && l.region !== regionFilter) return false;
      return true;
    });
  }, [portalLeads, tierFilter, urgencyFilter, regionFilter]);

  async function claimLead(leadId: string) {
    const res = await fetch(`/api/commission/portal-leads/${leadId}/claim`, {
      method: "POST",
    });
    if (res.ok) {
      toast("Lead claimed — it's now in your queue");
      setPortalLeads((prev) => prev.filter((l) => l.id !== leadId));
      setTab("queue");
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Could not claim lead", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Commission Queue</h1>
        <p className="text-sm text-slate-muted">
          Your assigned leads and portal listings to pick up
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            ["queue", "My Queue"],
            ["portal", "Portal Leads"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              tab === id
                ? "border-brand text-brand"
                : "border-transparent text-slate-muted"
            )}
          >
            {label}
            {id === "portal" && portalLeads.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 text-xs text-accent">
                {portalLeads.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        <RmQueueClient
          queueVariant="commission"
          userRole="commissionRm"
        />
      ) : (
        <>
          <p className="text-sm text-slate-muted">
            Leads listed on olready.in — not yet assigned to an RM
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-medium text-slate-muted self-center">
              Budget tier:
            </span>
            <button
              type="button"
              onClick={() => setTierFilter("")}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                !tierFilter ? "bg-accent text-white" : "border border-slate-200"
              )}
            >
              All
            </button>
            {TIER_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTierFilter(t)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  tierFilter === t
                    ? "bg-accent text-white"
                    : "border border-slate-200"
                )}
              >
                {BUDGET_TIER_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-medium text-slate-muted self-center">
              Urgency:
            </span>
            <button
              type="button"
              onClick={() => setUrgencyFilter("")}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                !urgencyFilter ? "bg-accent text-white" : "border border-slate-200"
              )}
            >
              All
            </button>
            {URGENCY_OPTIONS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgencyFilter(u)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  urgencyFilter === u
                    ? "bg-accent text-white"
                    : "border border-slate-200"
                )}
              >
                {URGENCY_LABELS[u]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-medium text-slate-muted self-center">
              Region:
            </span>
            <button
              type="button"
              onClick={() => setRegionFilter("")}
              className={cn(
                "rounded-full px-3 py-1 text-xs capitalize",
                !regionFilter ? "bg-accent text-white" : "border border-slate-200"
              )}
            >
              All
            </button>
            {REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegionFilter(r)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs capitalize",
                  regionFilter === r
                    ? "bg-accent text-white"
                    : "border border-slate-200"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
          ) : (
            <div className="grid gap-3">
              {filteredPortal.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  hideAssignmentWindow
                  footer={
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => void claimLead(lead.id)}
                    >
                      Claim & work this lead
                    </Button>
                  }
                />
              ))}
              {!filteredPortal.length && (
                <p className="py-12 text-center text-sm text-slate-muted">
                  No portal leads match your filters
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
