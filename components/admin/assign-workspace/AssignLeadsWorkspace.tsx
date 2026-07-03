"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddLeadModal } from "@/components/leads/AddLeadModal";
import { AssignLeadsTabBar } from "@/components/admin/assign-workspace/AssignLeadsTabBar";
import { AssignedLeadsTable } from "@/components/admin/assign-workspace/AssignedLeadsTable";
import {
  ReviewClosedLeadsTable,
  reviewExitNote,
  type AssignUploadLeadRow,
} from "@/components/admin/assign-workspace/ReviewClosedLeadsTable";
import { UnassignedLeadsTable } from "@/components/admin/assign-workspace/UnassignedLeadsTable";
import type { CommissionRmOption, RmOption } from "@/components/admin/assign-workspace/assign-types";
import { VerifyLeadSlideOver } from "@/components/upload/VerifyLeadSlideOver";
import { UploaderCloseLeadModal } from "@/components/upload/UploaderCloseLeadModal";
import { UploaderNoteModal } from "@/components/upload/UploaderNoteModal";
import { ReactivateLeadModal } from "@/components/upload/ReactivateLeadModal";
import { PhoneLeadHistoryModal } from "@/components/upload/PhoneLeadHistoryModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { AdminExitCounts } from "@/lib/admin-exit-leads-shared";
import {
  buildAssignApiQuery,
  buildAssignWorkspaceUrl,
  buildUploadLeadsQuery,
  EMPTY_ASSIGN_WORKSPACE_FILTERS,
  parseAssignWorkspaceTab,
  parseFiltersFromParams,
  type AssignWorkspaceFilters,
  type AssignWorkspaceTab,
} from "@/lib/admin-assign-workspace-url";
import { adminCsvHref } from "@/lib/admin-csv-export";
import {
  EXIT_MARKED_BY_LABELS,
  LEAD_EXIT_LABELS,
  type ExitMarkedByRole,
  type ExitSourceFilter,
} from "@/lib/lead-exit";
import {
  UPLOAD_CONNECT_ATTEMPT_FILTER_LABELS,
  UPLOAD_PENDING_SORT_LABELS,
  type UploadConnectAttemptFilter,
  type UploadPendingSort,
} from "@/lib/upload-pending-filters";
import {
  BUDGET_TIER_LABELS,
  LEAD_STATUS_LABELS,
  type BrideLead,
  type BudgetTier,
  type LeadFull,
  type LeadStatus,
  type Region,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const REGIONS: { value: Region; label: string }[] = [
  { value: "north", label: "North" },
  { value: "east", label: "East" },
  { value: "west", label: "West" },
  { value: "south", label: "South" },
];

const TIERS: BudgetTier[] = ["tier1", "tier2", "tier3", "tier4"];
const ASSIGNED_STATUSES: LeadStatus[] = ["assigned", "commissionRm", "booked"];

export function AssignLeadsWorkspace() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const syncingFromUrl = useRef(false);

  const [tab, setTab] = useState<AssignWorkspaceTab>(() =>
    parseAssignWorkspaceTab(searchParams.get("tab"))
  );
  const [draft, setDraft] = useState<AssignWorkspaceFilters>(() =>
    parseFiltersFromParams(searchParams)
  );
  const [applied, setApplied] = useState<AssignWorkspaceFilters>(() =>
    parseFiltersFromParams(searchParams)
  );

  const [unassigned, setUnassigned] = useState<BrideLead[]>([]);
  const [assigned, setAssigned] = useState<LeadFull[]>([]);
  const [workflowLeads, setWorkflowLeads] = useState<AssignUploadLeadRow[]>([]);
  const [exitCounts, setExitCounts] = useState<AdminExitCounts | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [rms, setRms] = useState<RmOption[]>([]);
  const [commissionRms, setCommissionRms] = useState<CommissionRmOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignRm, setAssignRm] = useState<Record<string, string>>({});
  const [reassignRm, setReassignRm] = useState<Record<string, string>>({});
  const [reassignCommissionRm, setReassignCommissionRm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const [verifyLead, setVerifyLead] = useState<AssignUploadLeadRow | null>(null);
  const [forceReVerify, setForceReVerify] = useState(false);
  const [closeLead, setCloseLead] = useState<AssignUploadLeadRow | null>(null);
  const [closeUnassignedLead, setCloseUnassignedLead] = useState<BrideLead | null>(null);
  const [reactivateLead, setReactivateLead] = useState<AssignUploadLeadRow | null>(null);
  const [phoneHistoryLead, setPhoneHistoryLead] = useState<AssignUploadLeadRow | null>(null);
  const [noteLead, setNoteLead] = useState<AssignUploadLeadRow | null>(null);

  useEffect(() => {
    syncingFromUrl.current = true;
    const nextTab = parseAssignWorkspaceTab(searchParams.get("tab"));
    const nextFilters = parseFiltersFromParams(searchParams);
    setTab(nextTab);
    setDraft(nextFilters);
    setApplied(nextFilters);
    queueMicrotask(() => {
      syncingFromUrl.current = false;
    });
  }, [searchParams]);

  const pushUrl = useCallback(
    (nextTab: AssignWorkspaceTab, nextFilters: AssignWorkspaceFilters) => {
      if (syncingFromUrl.current) return;
      router.replace(buildAssignWorkspaceUrl(nextTab, nextFilters), { scroll: false });
    },
    [router]
  );

  const updateTab = useCallback(
    (nextTab: AssignWorkspaceTab) => {
      setTab(nextTab);
      pushUrl(nextTab, applied);
    },
    [applied, pushUrl]
  );

  const patchDraft = useCallback((patch: Partial<AssignWorkspaceFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyFilters = useCallback(() => {
    setApplied(draft);
    pushUrl(tab, draft);
  }, [draft, tab, pushUrl]);

  const clearQueueFilters = useCallback(() => {
    const next = {
      ...EMPTY_ASSIGN_WORKSPACE_FILTERS,
      exitSource: applied.exitSource,
      search: applied.search,
      reviewSort: applied.reviewSort,
      connectAttempts: applied.connectAttempts,
    };
    setDraft(next);
    setApplied(next);
    pushUrl(tab, next);
  }, [applied, tab, pushUrl]);

  const apiQuery = useMemo(() => buildAssignApiQuery(tab, applied), [tab, applied]);
  const filterQs = useMemo(() => {
    const s = apiQuery.toString();
    return s ? `?${s}` : "";
  }, [apiQuery]);

  const uploadQuery = useMemo(() => {
    if (tab === "uploader_review") {
      return buildUploadLeadsQuery("review", applied).toString();
    }
    if (tab === "closed") {
      return buildUploadLeadsQuery("closed", applied).toString();
    }
    return "";
  }, [tab, applied]);

  const displayUnassigned = useMemo(() => {
    if (applied.portalOnly) return unassigned.filter((l) => l.portalOnly);
    if (applied.excludePortal) return unassigned.filter((l) => !l.portalOnly);
    return unassigned;
  }, [unassigned, applied.portalOnly, applied.excludePortal]);

  const filtersDirty = useMemo(() => {
    if (tab === "uploader_review") {
      return (
        draft.region !== applied.region ||
        draft.state !== applied.state ||
        draft.tier !== applied.tier ||
        draft.assigneeId !== applied.assigneeId ||
        draft.eventDateFilter.mode !== applied.eventDateFilter.mode ||
        JSON.stringify(draft.eventDateFilter) !== JSON.stringify(applied.eventDateFilter) ||
        draft.search !== applied.search ||
        draft.exitSource !== applied.exitSource ||
        draft.reviewSort !== applied.reviewSort ||
        draft.connectAttempts !== applied.connectAttempts
      );
    }
    if (tab === "closed") {
      return draft.search !== applied.search;
    }
    return (
      draft.region !== applied.region ||
      draft.state !== applied.state ||
      draft.tier !== applied.tier ||
      draft.assigneeId !== applied.assigneeId ||
      draft.assignedStatus !== applied.assignedStatus ||
      draft.portalOnly !== applied.portalOnly ||
      draft.excludePortal !== applied.excludePortal ||
      draft.search !== applied.search ||
      draft.eventDateFilter.mode !== applied.eventDateFilter.mode ||
      JSON.stringify(draft.eventDateFilter) !== JSON.stringify(applied.eventDateFilter)
    );
  }, [draft, applied, tab]);

  const reviewFiltersDirty =
    tab === "uploader_review" &&
    (draft.search !== applied.search || draft.exitSource !== applied.exitSource);

  const customEventDateIncomplete =
    (tab === "unassigned" || tab === "assigned") &&
    draft.eventDateFilter.mode === "date" &&
    !draft.eventDateFilter.date;

  const loadMeta = useCallback(() => {
    void fetch("/api/admin/cities")
      .then((r) => r.json())
      .then((json: { data?: { state: string }[] }) => {
        const unique = [
          ...new Set((json.data ?? []).map((c) => c.state).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b));
        setStates(unique);
      });
    void fetch("/api/admin/rms")
      .then((r) => r.json())
      .then((json: { data: RmOption[] }) => setRms(json.data ?? []));
    void fetch("/api/staff/commission-rms")
      .then((r) => r.json())
      .then((json: { data: CommissionRmOption[] }) => setCommissionRms(json.data ?? []));
  }, []);

  const loadExitCounts = useCallback(() => {
    const qs = new URLSearchParams(apiQuery);
    qs.set("counts", "true");
    qs.set("view", "uploader_review");
    void fetch(`/api/admin/leads/exit?${qs}`)
      .then((r) => r.json())
      .then((json: { data?: { counts?: AdminExitCounts } | null }) => {
        if (json.data?.counts) setExitCounts(json.data.counts);
      });
  }, [apiQuery]);

  const loadUnassigned = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/leads/unassigned${filterQs}`)
      .then((r) => r.json())
      .then((json: { data: BrideLead[] }) => {
        setUnassigned(json.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filterQs]);

  const loadAssigned = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/leads/assigned${filterQs}`)
      .then((r) => r.json())
      .then((json: { data: LeadFull[] }) => {
        const rows = json.data ?? [];
        setAssigned(rows);
        setReassignRm((prev) => {
          const next = { ...prev };
          for (const l of rows) {
            if (l.status === "assigned" && l.assignedRmId) {
              next[l.id] = l.assignedRmId;
            }
          }
          return next;
        });
        setReassignCommissionRm((prev) => {
          const next = { ...prev };
          for (const l of rows) {
            if (l.status === "commissionRm" && l.assignedRmId) {
              next[l.id] = l.assignedRmId;
            }
          }
          return next;
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filterQs]);

  const loadWorkflow = useCallback(() => {
    setLoading(true);
    void fetch(`/api/upload/leads?${uploadQuery}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          data: AssignUploadLeadRow[] | null;
          error?: string | null;
        };
        if (!r.ok) {
          toast(json.error ?? "Failed to load leads", "error");
          setWorkflowLeads([]);
          setLoading(false);
          return;
        }
        setWorkflowLeads(json.data ?? []);
        setLoading(false);
      })
      .catch(() => {
        toast("Failed to load leads", "error");
        setWorkflowLeads([]);
        setLoading(false);
      });
  }, [uploadQuery, toast]);

  const reload = useCallback(() => {
    loadMeta();
    loadExitCounts();
    if (tab === "unassigned") loadUnassigned();
    else if (tab === "assigned") loadAssigned();
    else loadWorkflow();
  }, [tab, loadMeta, loadExitCounts, loadUnassigned, loadAssigned, loadWorkflow]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const verifyId = searchParams.get("verify");
    if (!verifyId || tab !== "uploader_review") return;
    const match = workflowLeads.find((l) => l.id === verifyId);
    if (match) setVerifyLead(match);
  }, [searchParams, workflowLeads, tab]);

  const clearVerifyDeepLink = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("verify")) return;
    params.delete("verify");
    const qs = params.toString();
    router.replace(qs ? `/admin/assign?${qs}` : "/admin/assign", { scroll: false });
  }, [router, searchParams]);

  function exportListCsv() {
    if (tab === "unassigned") {
      const qs = new URLSearchParams(apiQuery);
      window.location.href = adminCsvHref("/api/admin/leads/unassigned", qs.toString());
      return;
    }
    if (tab === "assigned") {
      const qs = new URLSearchParams(apiQuery);
      window.location.href = adminCsvHref("/api/admin/leads/assigned", qs.toString());
      return;
    }
    const qs = buildUploadLeadsQuery(tab === "closed" ? "closed" : "review", applied);
    window.location.href = adminCsvHref("/api/upload/leads", qs.toString());
  }

  function exportLeadLog() {
    if (tab !== "unassigned") return;
    const qs = new URLSearchParams(apiQuery);
    qs.set("view", "unassigned");
    window.location.href = `/api/admin/leads/log-export?${qs}`;
  }

  async function assignOne(leadId: string) {
    const choice = assignRm[leadId];
    if (!choice) return;

    if (choice === "portal") {
      const res = await fetch("/api/admin/leads/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, target: "portal" }),
      });
      if (res.ok) {
        toast("Marked portal-only");
        loadUnassigned();
        loadExitCounts();
      } else {
        const json = (await res.json()) as { error?: string };
        toast(json.error ?? "Failed", "error");
      }
      return;
    }

    if (choice.startsWith("commission:")) {
      const commissionRmId = choice.slice("commission:".length);
      const res = await fetch("/api/admin/leads/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, target: "commission", commissionRmId }),
      });
      if (res.ok) {
        const rm = commissionRms.find((c) => c.id === commissionRmId);
        toast(rm ? `Sent to ${rm.name}` : "Sent to commission");
        loadUnassigned();
        loadExitCounts();
      } else {
        const json = (await res.json()) as { error?: string };
        toast(json.error ?? "Failed", "error");
      }
      return;
    }

    const res = await fetch("/api/admin/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: [leadId], rmId: choice }),
    });
    if (res.ok) {
      toast("Lead assigned");
      loadUnassigned();
      loadExitCounts();
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Failed", "error");
    }
  }

  async function bulkAssign() {
    const leadIds = [...selected];
    const choice = assignRm["bulk"];
    if (!leadIds.length || !choice || choice === "portal") return;

    if (choice.startsWith("commission:")) {
      const commissionRmId = choice.slice("commission:".length);
      const results = await Promise.all(
        leadIds.map((leadId) =>
          fetch("/api/admin/leads/reassign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId, target: "commission", commissionRmId }),
          })
        )
      );
      const ok = results.filter((r) => r.ok).length;
      if (ok > 0) {
        const rm = commissionRms.find((c) => c.id === commissionRmId);
        toast(rm ? `Sent ${ok} leads to ${rm.name}` : `Sent ${ok} leads to commission`);
        setSelected(new Set());
        loadUnassigned();
        loadExitCounts();
      } else {
        toast("Bulk assign failed", "error");
      }
      return;
    }

    const res = await fetch("/api/admin/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds, rmId: choice }),
    });
    if (res.ok) {
      toast(`Assigned ${leadIds.length} leads`);
      setSelected(new Set());
      loadUnassigned();
      loadExitCounts();
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Bulk assign failed", "error");
    }
  }

  async function reassign(leadId: string, target: "rm" | "commission" | "portal") {
    const rmId = target === "rm" ? reassignRm[leadId] : undefined;
    const commissionRmId = target === "commission" ? reassignCommissionRm[leadId] : undefined;
    if (target === "rm" && !rmId) {
      toast("Select an RM", "error");
      return;
    }
    if (target === "commission" && !commissionRmId) {
      toast("Select a Commission RM", "error");
      return;
    }
    const res = await fetch("/api/admin/leads/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, target, rmId, commissionRmId }),
    });
    if (res.ok) {
      toast("Lead updated");
      loadAssigned();
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Reassign failed", "error");
    }
  }

  function openReverify(lead: AssignUploadLeadRow) {
    setForceReVerify(true);
    setVerifyLead(lead);
  }

  function beginReactivateVerify(lead: AssignUploadLeadRow, note: string | null) {
    if (note) {
      void fetch(`/api/upload/leads/${lead.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: `${LEAD_EXIT_LABELS.reactivate}: ${note}` }),
      });
    }
    setForceReVerify(true);
    setVerifyLead(lead);
  }

  function openCloseLead(lead: AssignUploadLeadRow) {
    setVerifyLead(null);
    clearVerifyDeepLink();
    setCloseLead(lead);
  }

  function applyReviewSearchFilters() {
    setApplied((prev) => ({
      ...prev,
      search: draft.search,
      exitSource: draft.exitSource,
    }));
    pushUrl(tab, { ...applied, search: draft.search, exitSource: draft.exitSource });
  }

  function applyReviewInstantFilters(next: Partial<AssignWorkspaceFilters>) {
    const merged = { ...applied, ...next };
    setDraft((prev) => ({ ...prev, ...next }));
    setApplied(merged);
    pushUrl(tab, merged);
  }

  const resultCount =
    tab === "unassigned"
      ? displayUnassigned.length
      : tab === "assigned"
        ? assigned.length
        : workflowLeads.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Assign leads</h1>
          <p className="text-sm text-slate-muted">
            Verified pool assignment, active RM ownership, uploader review, and closed leads
          </p>
        </div>
        {tab === "unassigned" ? (
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            Add lead
          </Button>
        ) : null}
      </div>

      <AssignLeadsTabBar
        tab={tab}
        unassignedCount={displayUnassigned.length}
        assignedCount={assigned.length}
        exitCounts={exitCounts}
        onTabChange={updateTab}
      />

      {tab === "uploader_review" ? (
        <p className="text-sm text-slate-muted">
          RM or Commission exits in one queue. Re-verify to reach the bride and log connect
          attempts, or {LEAD_EXIT_LABELS.closeLead.toLowerCase()} when done.
        </p>
      ) : null}

      {tab === "closed" ? (
        <p className="text-sm text-slate-muted">
          Leads finalized off the pipeline. {LEAD_EXIT_LABELS.reactivate} opens re-verification
          — routing is set when you complete that step.
        </p>
      ) : null}

      {tab === "uploader_review" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
            <span className="text-slate-muted">State</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={draft.state}
              onChange={(e) =>
                applyReviewInstantFilters({ state: e.target.value })
              }
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
            <span className="text-slate-muted">Sort</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={draft.reviewSort}
              onChange={(e) =>
                applyReviewInstantFilters({
                  reviewSort: e.target.value as UploadPendingSort,
                })
              }
            >
              {(Object.keys(UPLOAD_PENDING_SORT_LABELS) as UploadPendingSort[]).map((key) => (
                <option key={key} value={key}>
                  {UPLOAD_PENDING_SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 pb-2">
            <span className="self-center text-xs font-medium text-slate-muted">
              Contact attempt
            </span>
            {(["all", "1", "2"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  applyReviewInstantFilters({ connectAttempts: value })
                }
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm",
                  draft.connectAttempts === value
                    ? "bg-brand text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                {UPLOAD_CONNECT_ATTEMPT_FILTER_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Card className="flex flex-wrap items-end gap-4 p-4">
        {(tab === "unassigned" || tab === "assigned") && (
          <div className="min-w-[220px] flex-1 max-w-md">
            <Input
              label="Search leads"
              value={draft.search}
              onChange={(e) => patchDraft({ search: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Name, lead ID, or phone"
            />
          </div>
        )}

        {(tab === "uploader_review" || tab === "closed") && (
          <div className="min-w-[220px] flex-1 max-w-md">
            <Input
              label={
                tab === "uploader_review" ? "Search review queue" : "Search closed leads"
              }
              value={draft.search}
              onChange={(e) => patchDraft({ search: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (tab === "uploader_review") applyReviewSearchFilters();
                  else applyFilters();
                }
              }}
              placeholder="Name, city, or phone"
            />
          </div>
        )}

        {tab === "uploader_review" ? (
          <label className="text-sm">
            Marked by
            <select
              className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
              value={draft.exitSource}
              onChange={(e) =>
                patchDraft({ exitSource: e.target.value as ExitSourceFilter })
              }
            >
              <option value="all">Anyone</option>
              {(
                [
                  "regional_rm",
                  "commission_rm",
                  "lead_uploader",
                  "admin",
                  "owner",
                ] as ExitMarkedByRole[]
              ).map((key) => (
                <option key={key} value={key}>
                  {EXIT_MARKED_BY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {(tab === "unassigned" || tab === "assigned") && (
          <>
            <label className="text-sm">
              Region
              <select
                className="mt-1 block min-w-[8rem] rounded border border-slate-200 px-2 py-2 text-sm capitalize"
                value={draft.region}
                onChange={(e) => patchDraft({ region: e.target.value as Region | "" })}
              >
                <option value="">All</option>
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              State
              <select
                className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
                value={draft.state}
                onChange={(e) => patchDraft({ state: e.target.value })}
              >
                <option value="">All</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Budget tier
              <select
                className="mt-1 block min-w-[8rem] rounded border border-slate-200 px-2 py-2 text-sm"
                value={draft.tier}
                onChange={(e) => patchDraft({ tier: e.target.value as BudgetTier | "" })}
              >
                <option value="">All</option>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {BUDGET_TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Event date
              <select
                className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
                value={draft.eventDateFilter.mode}
                onChange={(e) => {
                  const mode = e.target.value as "all" | "date";
                  patchDraft({
                    eventDateFilter:
                      mode === "all"
                        ? { mode: "all" }
                        : {
                            mode: "date",
                            date:
                              draft.eventDateFilter.mode === "date"
                                ? draft.eventDateFilter.date
                                : "",
                          },
                  });
                }}
              >
                <option value="all">Since the beginning</option>
                <option value="date">Custom date</option>
              </select>
            </label>
            {draft.eventDateFilter.mode === "date" ? (
              <Input
                label="On date"
                type="date"
                value={draft.eventDateFilter.date}
                onChange={(e) =>
                  patchDraft({
                    eventDateFilter: { mode: "date", date: e.target.value },
                  })
                }
              />
            ) : null}
          </>
        )}

        {tab === "unassigned" ? (
          <div className="flex flex-wrap items-center gap-4 self-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.portalOnly}
                onChange={(e) =>
                  patchDraft({
                    portalOnly: e.target.checked,
                    excludePortal: e.target.checked ? false : draft.excludePortal,
                  })
                }
                className="rounded border-slate-300"
              />
              Portal-only view
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.excludePortal}
                onChange={(e) =>
                  patchDraft({
                    excludePortal: e.target.checked,
                    portalOnly: e.target.checked ? false : draft.portalOnly,
                  })
                }
                className="rounded border-slate-300"
              />
              Hide portal leads
            </label>
          </div>
        ) : null}

        {tab === "assigned" ? (
          <>
            <label className="text-sm">
              Status
              <select
                className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
                value={draft.assignedStatus}
                onChange={(e) =>
                  patchDraft({ assignedStatus: e.target.value as LeadStatus | "" })
                }
              >
                <option value="">All active</option>
                {ASSIGNED_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Assignee
              <select
                className="mt-1 block min-w-[10rem] rounded border border-slate-200 px-2 py-2 text-sm"
                value={draft.assigneeId}
                onChange={(e) => patchDraft({ assigneeId: e.target.value })}
              >
                <option value="">Any assignee</option>
                {rms.length > 0 ? (
                  <optgroup label="Regional RM">
                    {rms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {commissionRms.length > 0 ? (
                  <optgroup label="Commission RM">
                    {commissionRms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          </>
        ) : null}

        <Button
          type="button"
          onClick={
            tab === "uploader_review" && reviewFiltersDirty
              ? applyReviewSearchFilters
              : applyFilters
          }
          disabled={
            customEventDateIncomplete ||
            (!filtersDirty && !(tab === "uploader_review" && reviewFiltersDirty))
          }
        >
          Apply
        </Button>

        {(tab === "unassigned" || tab === "assigned") && filtersDirty ? (
          <Button type="button" variant="ghost" onClick={clearQueueFilters}>
            Clear
          </Button>
        ) : null}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={exportListCsv}>
            Export list CSV
          </Button>
          {tab === "unassigned" ? (
            <Button type="button" variant="secondary" onClick={exportLeadLog}>
              Export lead log
            </Button>
          ) : null}
        </div>
      </Card>

      {exitCounts && tab === "uploader_review" ? (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-brand">Review queue breakdown</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="muted">
              Total {exitCounts.uploaderReview.toLocaleString("en-IN")}
            </Badge>
            <Badge variant="muted">
              Not answering {exitCounts.notAnswering.toLocaleString("en-IN")}
            </Badge>
            <Badge variant="muted">
              Not interested {exitCounts.notInterested.toLocaleString("en-IN")}
            </Badge>
          </div>
        </Card>
      ) : null}

      <p className="text-sm text-slate-muted">
        Showing {resultCount.toLocaleString("en-IN")} lead{resultCount === 1 ? "" : "s"}
        {applied.region ? (
          <>
            {" "}
            · region <strong className="capitalize">{applied.region}</strong>
          </>
        ) : null}
        {applied.state ? (
          <>
            {" "}
            · state <strong>{applied.state}</strong>
          </>
        ) : null}
        {applied.eventDateFilter.mode === "date" &&
        applied.eventDateFilter.date &&
        (tab === "unassigned" || tab === "assigned") ? (
          <>
            {" "}
            · event on <strong>{formatDate(applied.eventDateFilter.date)}</strong>
          </>
        ) : null}
        {applied.portalOnly && tab === "unassigned" ? (
          <>
            {" "}
            · <strong>portal-only</strong>
          </>
        ) : null}
        {applied.excludePortal && tab === "unassigned" ? (
          <>
            {" "}
            · <strong>portal excluded</strong>
          </>
        ) : null}
        {applied.search.trim() && (tab === "unassigned" || tab === "assigned") ? (
          <>
            {" "}
            · search <strong>{applied.search.trim()}</strong>
          </>
        ) : null}
      </p>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="py-12 text-center text-slate-muted">Loading…</div>
        ) : tab === "unassigned" ? (
          <UnassignedLeadsTable
            leads={displayUnassigned}
            selected={selected}
            assignRm={assignRm}
            bulkRmId={assignRm["bulk"] ?? ""}
            rms={rms}
            commissionRms={commissionRms}
            onSelect={(leadId, checked) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (checked) next.add(leadId);
                else next.delete(leadId);
                return next;
              });
            }}
            onSelectAll={(checked) => {
              setSelected(
                checked ? new Set(displayUnassigned.map((l) => l.id)) : new Set()
              );
            }}
            onBulkRmChange={(v) => setAssignRm((a) => ({ ...a, bulk: v }))}
            onBulkAssign={bulkAssign}
            onAssignChoiceChange={(leadId, v) =>
              setAssignRm((a) => ({ ...a, [leadId]: v }))
            }
            onAssign={assignOne}
            onCloseLead={setCloseUnassignedLead}
          />
        ) : tab === "assigned" ? (
          <AssignedLeadsTable
            leads={assigned}
            reassignRm={reassignRm}
            reassignCommissionRm={reassignCommissionRm}
            rms={rms}
            commissionRms={commissionRms}
            onReassignRmChange={(leadId, v) =>
              setReassignRm((a) => ({ ...a, [leadId]: v }))
            }
            onReassignCommissionRmChange={(leadId, v) =>
              setReassignCommissionRm((a) => ({ ...a, [leadId]: v }))
            }
            onReassign={reassign}
          />
        ) : (
          <ReviewClosedLeadsTable
            tab={tab === "closed" ? "closed" : "review"}
            leads={workflowLeads}
            onReverify={openReverify}
            onClose={openCloseLead}
            onReactivate={setReactivateLead}
            onHistory={setPhoneHistoryLead}
            onNote={setNoteLead}
          />
        )}
      </Card>

      <VerifyLeadSlideOver
        open={!!verifyLead}
        onClose={() => {
          setVerifyLead(null);
          setForceReVerify(false);
          clearVerifyDeepLink();
        }}
        lead={verifyLead}
        reVerify={tab === "uploader_review" || forceReVerify}
        priorContext={
          (tab === "uploader_review" || forceReVerify) &&
          verifyLead &&
          !verifyLead.hostileNote?.trim()
            ? verifyLead.handoverReason ?? null
            : null
        }
        notAnsweringNote={
          tab === "uploader_review" || forceReVerify ? verifyLead?.hostileNote ?? null : null
        }
        onVerified={(outcome) => {
          const wasReVerify = tab === "uploader_review" || forceReVerify;
          const fromClosedReactivate = tab === "closed" && forceReVerify;
          setVerifyLead(null);
          setForceReVerify(false);
          clearVerifyDeepLink();
          if (outcome === "not_interested") {
            toast("Lead closed");
            updateTab("closed");
          } else if (outcome === "not_answering") {
            toast(`Marked ${LEAD_EXIT_LABELS.notAnswering.toLowerCase()}`);
            updateTab("uploader_review");
          } else if (wasReVerify) {
            toast(
              fromClosedReactivate
                ? "Lead reactivated"
                : "Lead re-verified — previous RM/Commission exit was incorrect"
            );
            updateTab("unassigned");
          } else {
            toast("Lead verified");
            updateTab("unassigned");
          }
          reload();
        }}
      />

      <UploaderCloseLeadModal
        open={!!closeLead}
        onClose={() => setCloseLead(null)}
        leadId={closeLead?.id ?? ""}
        brideName={closeLead?.brideName ?? ""}
        exitNote={closeLead ? reviewExitNote(closeLead) : null}
        exitMarkedByRole={closeLead?.exitMarkedByRole}
        onSaved={() => {
          toast("Lead closed");
          setVerifyLead(null);
          clearVerifyDeepLink();
          updateTab("closed");
          reload();
        }}
      />

      <UploaderCloseLeadModal
        open={!!closeUnassignedLead}
        onClose={() => setCloseUnassignedLead(null)}
        leadId={closeUnassignedLead?.id ?? ""}
        brideName={closeUnassignedLead?.brideName ?? ""}
        onSaved={() => {
          toast("Lead closed");
          setCloseUnassignedLead(null);
          loadUnassigned();
          loadExitCounts();
        }}
      />

      <PhoneLeadHistoryModal
        open={!!phoneHistoryLead}
        onClose={() => setPhoneHistoryLead(null)}
        leadId={phoneHistoryLead?.id ?? ""}
        phone={phoneHistoryLead?.phone ?? ""}
        brideName={phoneHistoryLead?.brideName ?? ""}
        displayId={phoneHistoryLead?.displayId ?? ""}
        excludeLeadId={phoneHistoryLead?.id ?? ""}
      />

      <UploaderNoteModal
        open={!!noteLead}
        onClose={() => setNoteLead(null)}
        leadId={noteLead?.id ?? ""}
        brideName={noteLead?.brideName ?? ""}
        onSaved={() => toast("Note saved to lead activity")}
      />

      <ReactivateLeadModal
        open={!!reactivateLead}
        onClose={() => setReactivateLead(null)}
        leadId={reactivateLead?.id ?? ""}
        brideName={reactivateLead?.brideName ?? ""}
        handoverReason={reactivateLead?.handoverReason}
        onConfirm={(note) => {
          if (!reactivateLead) return;
          beginReactivateVerify(reactivateLead, note);
          setReactivateLead(null);
        }}
      />

      <AddLeadModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          loadUnassigned();
          loadExitCounts();
        }}
      />
    </div>
  );
}
