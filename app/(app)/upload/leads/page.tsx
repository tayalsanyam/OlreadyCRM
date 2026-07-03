"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { VerifyLeadSlideOver } from "@/components/upload/VerifyLeadSlideOver";
import { UploaderNoteModal } from "@/components/upload/UploaderNoteModal";
import { UploaderCloseLeadModal } from "@/components/upload/UploaderCloseLeadModal";
import { ReactivateLeadModal } from "@/components/upload/ReactivateLeadModal";
import { LeadImportWizard } from "@/components/import/LeadImportWizard";
import { AddLeadModal } from "@/components/leads/AddLeadModal";
import { useToast } from "@/components/ui/Toast";
import {
  EXIT_MARKED_BY_LABELS,
  LEAD_EXIT_LABELS,
  parseUploadLeadTab,
  type ExitMarkedByRole,
  type ExitSourceFilter,
  type UploadLeadTab,
} from "@/lib/lead-exit";
import { VerifiedLeadManageModal } from "@/components/upload/VerifiedLeadManageModal";
import { PhoneLeadHistoryModal } from "@/components/upload/PhoneLeadHistoryModal";
import { LeadQuickContact } from "@/components/leads/LeadQuickContact";
import { describeUploadLeadResponsible } from "@/lib/upload-lead-responsible";
import {
  VERIFIED_ROUTING_FILTER_LABELS,
  type VerifiedRoutingFilter,
} from "@/lib/upload-verified-filters";
import {
  UPLOAD_CONNECT_ATTEMPT_FILTER_LABELS,
  UPLOAD_PENDING_SORT_LABELS,
  type UploadConnectAttemptFilter,
  type UploadPendingSort,
} from "@/lib/upload-pending-filters";
import { BUDGET_TIER_LABELS, type BrideLead } from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";
import { MAX_VERIFICATION_CONNECT_ATTEMPTS } from "@/lib/lead-uploader-config";
import { parseUploadReferralCreateLeadParams, FEEDBACK_REFERRAL_LEAD_SOURCE } from "@/lib/upload-referral-lead-url";

type UploadLeadRow = BrideLead & {
  eventCount?: number;
  ceremonies?: string | null;
  portalOnly?: boolean;
  handoverReason?: string | null;
  assignedRmName?: string | null;
};

const TAB_LABELS: Record<UploadLeadTab, string> = {
  pending: "Pending verification",
  verified: "Verified",
  review: LEAD_EXIT_LABELS.uploaderReview,
  closed: LEAD_EXIT_LABELS.uploaderClosed,
};

function reviewExitNote(l: UploadLeadRow): string {
  if (l.hostileNote?.trim()) return l.hostileNote.trim();
  return l.handoverReason?.trim() || "—";
}

function exitMarkedByLabel(role: string | null | undefined): string | null {
  if (!role || !(role in EXIT_MARKED_BY_LABELS)) return null;
  return EXIT_MARKED_BY_LABELS[role as ExitMarkedByRole];
}

const WORKFLOW_TABS: UploadLeadTab[] = ["review", "closed"];

type RmOption = { id: string; name: string };

function verifiedRoutingBadge(l: UploadLeadRow) {
  if (l.status === "commissionRm") {
    return <Badge className="bg-amber-100 text-amber-900">Commission</Badge>;
  }
  if (l.portalOnly) {
    return <Badge className="bg-purple-100 text-purple-800">Portal</Badge>;
  }
  if (l.status === "assigned") {
    return <Badge className="bg-teal-100 text-teal-900">Assigned</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-700">Unassigned</Badge>;
}

export default function UploadLeadsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<UploadLeadTab>(() =>
    parseUploadLeadTab(searchParams.get("tab"), searchParams.get("verified"))
  );
  const [leads, setLeads] = useState<UploadLeadRow[]>([]);
  const [verifyLead, setVerifyLead] = useState<UploadLeadRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [noteLead, setNoteLead] = useState<UploadLeadRow | null>(null);
  const [closeLead, setCloseLead] = useState<UploadLeadRow | null>(null);
  const [editLead, setEditLead] = useState<UploadLeadRow | null>(null);
  const [manageLead, setManageLead] = useState<UploadLeadRow | null>(null);
  const [phoneHistoryLead, setPhoneHistoryLead] = useState<UploadLeadRow | null>(null);
  const [reactivateLead, setReactivateLead] = useState<UploadLeadRow | null>(null);
  const [forceReVerify, setForceReVerify] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [routingFilter, setRoutingFilter] = useState<VerifiedRoutingFilter>("all");
  const [appliedRouting, setAppliedRouting] = useState<VerifiedRoutingFilter>("all");
  const [rmFilter, setRmFilter] = useState("");
  const [appliedRm, setAppliedRm] = useState("");
  const [eventFrom, setEventFrom] = useState("");
  const [appliedEventFrom, setAppliedEventFrom] = useState("");
  const [eventTo, setEventTo] = useState("");
  const [appliedEventTo, setAppliedEventTo] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [appliedState, setAppliedState] = useState("");
  const [hideExpired, setHideExpired] = useState(true);
  const [appliedHideExpired, setAppliedHideExpired] = useState(true);
  const [hideBooked, setHideBooked] = useState(true);
  const [appliedHideBooked, setAppliedHideBooked] = useState(true);
  const [states, setStates] = useState<string[]>([]);
  const [exitSourceFilter, setExitSourceFilter] = useState<ExitSourceFilter>("all");
  const [appliedExitSource, setAppliedExitSource] = useState<ExitSourceFilter>("all");
  const [reviewConnectAttemptFilter, setReviewConnectAttemptFilter] =
    useState<UploadConnectAttemptFilter>("all");
  const [reviewSort, setReviewSort] = useState<UploadPendingSort>("latest");
  const [reviewStateFilter, setReviewStateFilter] = useState("");
  const [pendingSort, setPendingSort] = useState<UploadPendingSort>("latest");
  const [pendingStateFilter, setPendingStateFilter] = useState("");
  const [connectAttemptFilter, setConnectAttemptFilter] =
    useState<UploadConnectAttemptFilter>("all");
  const [rms, setRms] = useState<RmOption[]>([]);

  const referralCreate = useMemo(
    () => parseUploadReferralCreateLeadParams(searchParams),
    [searchParams],
  );

  const clearVerifyDeepLink = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("verify")) return;
    params.delete("verify");
    const qs = params.toString();
    router.replace(qs ? `/upload/leads?${qs}` : "/upload/leads", { scroll: false });
  }, [router, searchParams]);

  const clearReferralCreateLink = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("add")) return;
    params.delete("add");
    params.delete("brideName");
    params.delete("phone");
    params.delete("referralId");
    const qs = params.toString();
    router.replace(qs ? `/upload/leads?${qs}` : "/upload/leads", { scroll: false });
  }, [router, searchParams]);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ tab });
    if (tab === "pending") {
      qs.set("sort", pendingSort);
      if (pendingStateFilter) qs.set("state", pendingStateFilter);
      if (connectAttemptFilter !== "all") {
        qs.set("connectAttempts", connectAttemptFilter);
      }
    }
    if (tab === "verified" || tab === "closed" || tab === "review") {
      if (appliedSearch.trim()) qs.set("q", appliedSearch.trim());
    }
    if (tab === "review") {
      qs.set("sort", reviewSort);
      if (reviewStateFilter) qs.set("state", reviewStateFilter);
      if (appliedExitSource !== "all") qs.set("source", appliedExitSource);
      if (reviewConnectAttemptFilter !== "all") {
        qs.set("connectAttempts", reviewConnectAttemptFilter);
      }
    }
    if (tab === "verified") {
      if (appliedRouting !== "all") qs.set("routing", appliedRouting);
      if (appliedRm) qs.set("rmId", appliedRm);
      if (appliedEventFrom) qs.set("eventFrom", appliedEventFrom);
      if (appliedEventTo) qs.set("eventTo", appliedEventTo);
      if (appliedState) qs.set("state", appliedState);
      if (!appliedHideExpired) qs.set("excludeExpired", "0");
      if (!appliedHideBooked) qs.set("excludeBooked", "0");
    }
    void fetch(`/api/upload/leads?${qs}`)
      .then(async (r) => {
        const json = (await r.json()) as { data: UploadLeadRow[] | null; error?: string | null };
        if (!r.ok) {
          toast(json.error ?? "Failed to load leads");
          setLeads([]);
          return;
        }
        setLeads(json.data ?? []);
      })
      .catch(() => {
        toast("Failed to load leads");
        setLeads([]);
      });
  }, [
    tab,
    appliedSearch,
    appliedRouting,
    appliedRm,
    appliedEventFrom,
    appliedEventTo,
    appliedState,
    appliedHideExpired,
    appliedHideBooked,
    appliedExitSource,
    reviewConnectAttemptFilter,
    reviewSort,
    reviewStateFilter,
    pendingSort,
    pendingStateFilter,
    connectAttemptFilter,
    toast,
  ]);

  useEffect(() => {
    if (tab === "pending" || tab === "verified" || tab === "review") {
      void fetch("/api/upload/config")
        .then((r) => r.json())
        .then((json: { data?: { states?: string[] } }) => setStates(json.data?.states ?? []));
    }
    if (tab === "verified") {
      void fetch("/api/upload/rms")
        .then((r) => r.json())
        .then((json: { data: RmOption[] }) => setRms(json.data ?? []));
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setTab(parseUploadLeadTab(tabParam, searchParams.get("verified")));
    }
  }, [searchParams]);

  useEffect(() => {
    const verifyId = searchParams.get("verify");
    if (!verifyId || tab !== "review") return;
    const match = leads.find((l) => l.id === verifyId);
    if (match) setVerifyLead(match);
  }, [searchParams, leads, tab]);

  useEffect(() => {
    if (referralCreate?.open) {
      setAddOpen(true);
    }
  }, [referralCreate]);

  useEffect(() => {
    if (tab !== "verified" && tab !== "closed" && tab !== "review") {
      setAppliedSearch("");
    }
    if (tab !== "verified") {
      setAppliedRouting("all");
      setAppliedRm("");
      setAppliedEventFrom("");
      setAppliedEventTo("");
      setAppliedState("");
      setAppliedHideExpired(true);
      setAppliedHideBooked(true);
      setRoutingFilter("all");
      setRmFilter("");
      setEventFrom("");
      setEventTo("");
      setStateFilter("");
      setHideExpired(true);
      setHideBooked(true);
    }
    if (tab !== "review") {
      setAppliedExitSource("all");
      setExitSourceFilter("all");
      setReviewConnectAttemptFilter("all");
      setReviewSort("latest");
      setReviewStateFilter("");
    }
    if (tab !== "pending") {
      setPendingSort("latest");
      setPendingStateFilter("");
      setConnectAttemptFilter("all");
    }
  }, [tab]);

  function applyVerifiedFilters() {
    setAppliedSearch(searchQ.trim());
    setAppliedRouting(routingFilter);
    setAppliedRm(rmFilter);
    setAppliedEventFrom(eventFrom);
    setAppliedEventTo(eventTo);
    setAppliedState(stateFilter);
    setAppliedHideExpired(hideExpired);
    setAppliedHideBooked(hideBooked);
  }

  function applyReviewFilters() {
    setAppliedSearch(searchQ.trim());
    setAppliedExitSource(exitSourceFilter);
  }

  function openReverify(lead: UploadLeadRow) {
    setForceReVerify(true);
    setVerifyLead(lead);
  }

  function beginReactivateVerify(lead: UploadLeadRow, note: string | null) {
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

  function openCloseLead(lead: UploadLeadRow) {
    setVerifyLead(null);
    clearVerifyDeepLink();
    setCloseLead(lead);
  }

  const verifiedFiltersDirty =
    tab === "verified" &&
    (searchQ.trim() !== appliedSearch ||
      routingFilter !== appliedRouting ||
      rmFilter !== appliedRm ||
      eventFrom !== appliedEventFrom ||
      eventTo !== appliedEventTo ||
      stateFilter !== appliedState ||
      hideExpired !== appliedHideExpired ||
      hideBooked !== appliedHideBooked);

  const reviewFiltersDirty =
    tab === "review" &&
    (searchQ.trim() !== appliedSearch || exitSourceFilter !== appliedExitSource);

  const hasReviewFiltersApplied =
    tab === "review" &&
    (appliedSearch ||
      appliedExitSource !== "all" ||
      reviewConnectAttemptFilter !== "all" ||
      reviewStateFilter ||
      reviewSort !== "latest");

  const isWorkflowTab = WORKFLOW_TABS.includes(tab);
  const isVerifiedTab = tab === "verified";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Upload leads</h1>
          <p className="text-sm text-slate-muted">
            Review details inline before opening verify — add, import, or verify
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            Add lead
          </Button>
          <Button onClick={() => setImportOpen(true)}>Import leads</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(["pending", "verified", "review", "closed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm -mb-px",
              tab === t
                ? t === "review"
                  ? "border-red-500 text-red-700 font-medium"
                  : "border-accent text-accent font-medium"
                : "border-transparent text-slate-muted"
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "review" && (
        <p className="text-sm text-slate-muted">
          RM or Commission exits in one queue. Re-verify to reach the bride and log connect
          attempts, or {LEAD_EXIT_LABELS.closeLead.toLowerCase()} when done.
        </p>
      )}

      {tab === "review" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
            <span className="text-slate-muted">State</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={reviewStateFilter}
              onChange={(e) => setReviewStateFilter(e.target.value)}
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
              value={reviewSort}
              onChange={(e) => setReviewSort(e.target.value as UploadPendingSort)}
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
                onClick={() => setReviewConnectAttemptFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm",
                  reviewConnectAttemptFilter === value
                    ? "bg-brand text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                {UPLOAD_CONNECT_ATTEMPT_FILTER_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "closed" && (
        <p className="text-sm text-slate-muted">
          Leads finalized off the pipeline. {LEAD_EXIT_LABELS.reactivate} opens re-verification
          — routing is set when you complete that step.
        </p>
      )}

      {tab === "verified" && (
        <p className="text-sm text-slate-muted">
          <span className="font-medium text-brand">Responsible</span> shows who owns the lead
          next: <span className="font-medium">Unassigned</span> is verified but not on portal,
          commission, or a regional RM yet (waiting in the assign queue);{" "}
          <span className="font-medium">Portal</span> is open for commission RMs to claim; a
          person&apos;s name means that regional RM is on the lead.
        </p>
      )}

      {tab === "pending" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
            <span className="text-slate-muted">State</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={pendingStateFilter}
              onChange={(e) => setPendingStateFilter(e.target.value)}
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
              value={pendingSort}
              onChange={(e) => setPendingSort(e.target.value as UploadPendingSort)}
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
                onClick={() => setConnectAttemptFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm",
                  connectAttemptFilter === value
                    ? "bg-brand text-white"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                {UPLOAD_CONNECT_ATTEMPT_FILTER_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      {(tab === "verified" || tab === "closed" || tab === "review") && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 max-w-md">
              <Input
                label={
                  tab === "verified"
                    ? "Search verified leads"
                    : tab === "review"
                      ? "Search review queue"
                      : "Search closed leads"
                }
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (tab === "verified") applyVerifiedFilters();
                    else if (tab === "review") applyReviewFilters();
                    else setAppliedSearch(searchQ.trim());
                  }
                }}
                placeholder="Name, city, or phone"
              />
            </div>
            {tab === "review" && (
              <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
                <span className="text-slate-muted">Marked by</span>
                <select
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={exitSourceFilter}
                  onChange={(e) =>
                    setExitSourceFilter(e.target.value as ExitSourceFilter)
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
            )}
            {tab === "verified" && (
              <>
                <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
                  <span className="text-slate-muted">Routing</span>
                  <select
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={routingFilter}
                    onChange={(e) => setRoutingFilter(e.target.value as VerifiedRoutingFilter)}
                  >
                    {(Object.keys(VERIFIED_ROUTING_FILTER_LABELS) as VerifiedRoutingFilter[]).map(
                      (key) => (
                        <option key={key} value={key}>
                          {VERIFIED_ROUTING_FILTER_LABELS[key]}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
                  <span className="text-slate-muted">Regional RM</span>
                  <select
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={rmFilter}
                    onChange={(e) => setRmFilter(e.target.value)}
                  >
                    <option value="">Any RM</option>
                    {rms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Event from"
                  type="date"
                  value={eventFrom}
                  onChange={(e) => setEventFrom(e.target.value)}
                />
                <Input
                  label="Event to"
                  type="date"
                  value={eventTo}
                  onChange={(e) => setEventTo(e.target.value)}
                />
                <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
                  <span className="text-slate-muted">State</span>
                  <select
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                  >
                    <option value="">All states</option>
                    {states.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hideExpired}
                    onChange={(e) => setHideExpired(e.target.checked)}
                  />
                  Hide expired
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hideBooked}
                    onChange={(e) => setHideBooked(e.target.checked)}
                  />
                  Hide booked
                </label>
              </>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                if (tab === "verified") {
                  if (verifiedFiltersDirty) applyVerifiedFilters();
                  else load();
                } else if (tab === "review") {
                  if (reviewFiltersDirty) applyReviewFilters();
                  else load();
                } else {
                  const next = searchQ.trim();
                  if (next === appliedSearch) load();
                  else setAppliedSearch(next);
                }
              }}
            >
              {tab === "verified" && verifiedFiltersDirty
                ? "Apply filters"
                : tab === "review" && reviewFiltersDirty
                  ? "Apply filters"
                  : "Search"}
            </Button>
            {tab === "verified" &&
            (appliedRouting !== "all" ||
              appliedRm ||
              appliedEventFrom ||
              appliedEventTo ||
              appliedState ||
              !appliedHideExpired ||
              !appliedHideBooked ||
              appliedSearch) ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchQ("");
                  setRoutingFilter("all");
                  setRmFilter("");
                  setEventFrom("");
                  setEventTo("");
                  setStateFilter("");
                  setHideExpired(true);
                  setHideBooked(true);
                  setAppliedSearch("");
                  setAppliedRouting("all");
                  setAppliedRm("");
                  setAppliedEventFrom("");
                  setAppliedEventTo("");
                  setAppliedState("");
                  setAppliedHideExpired(true);
                  setAppliedHideBooked(true);
                }}
              >
                Clear filters
              </Button>
            ) : null}
            {tab === "review" && hasReviewFiltersApplied ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchQ("");
                  setExitSourceFilter("all");
                  setReviewConnectAttemptFilter("all");
                  setReviewSort("latest");
                  setReviewStateFilter("");
                  setAppliedSearch("");
                  setAppliedExitSource("all");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <TR>
              {isVerifiedTab ? (
                <>
                  <TH className="min-w-[10rem]">Lead</TH>
                  <TH>Location</TH>
                  <TH>Event</TH>
                  <TH>Budget</TH>
                  <TH>Source</TH>
                  <TH className="min-w-[9rem]">Responsible</TH>
                  <TH>Contact</TH>
                  <TH>Added</TH>
                  <TH className="min-w-[10rem]">Actions</TH>
                </>
              ) : (
                <>
                  <TH>ID</TH>
                  <TH>Bride</TH>
                  <TH>Phone</TH>
                  <TH>Email</TH>
                  <TH>City / Region</TH>
                  <TH>Event</TH>
                  <TH>Ceremonies</TH>
                  <TH>Budget</TH>
                  <TH>Source</TH>
                  <TH>Routing</TH>
                  {isWorkflowTab && <TH>Exit note</TH>}
                  <TH>Submitted</TH>
                  <TH />
                </>
              )}
            </TR>
          </THead>
          <TBody>
            {leads.map((l) => {
              if (isVerifiedTab) {
                const responsible = describeUploadLeadResponsible(l);
                return (
                  <TR key={l.id} className="align-top hover:bg-slate-50/80">
                    <TD className="min-w-[10rem]">
                      <span className="font-mono text-xs text-slate-muted">{l.displayId}</span>
                      <span className="mt-0.5 block font-medium text-brand">{l.brideName}</span>
                      <span className="text-sm whitespace-nowrap text-slate-800">{l.phone}</span>
                      {l.email ? (
                        <span className="block text-xs text-slate-muted">{l.email}</span>
                      ) : null}
                    </TD>
                    <TD className="text-sm">
                      <span>{l.city}</span>
                      <span className="block text-xs capitalize text-slate-muted">
                        {l.region ?? "At verify"}
                      </span>
                      {l.eventLocation ? (
                        <span className="block text-xs text-slate-muted">{l.eventLocation}</span>
                      ) : null}
                    </TD>
                    <TD className="text-sm whitespace-nowrap">
                      <span>{formatDate(l.eventDate)}</span>
                      <span className="mt-0.5 block max-w-[10rem] truncate text-xs text-slate-muted">
                        {l.ceremonies ?? (l.eventCount ? `${l.eventCount} event(s)` : "—")}
                      </span>
                    </TD>
                    <TD className="text-sm whitespace-nowrap">
                      <span className="font-medium">
                        {BUDGET_TIER_LABELS[l.budgetTier] ?? l.budgetTier}
                      </span>
                      {l.budgetAmount != null ? (
                        <span className="block text-xs text-slate-muted">
                          Rs. {Number(l.budgetAmount).toLocaleString("en-IN")}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-sm">{l.source ?? "—"}</TD>
                    <TD className="text-sm">
                      <div className="space-y-1">
                        {verifiedRoutingBadge(l)}
                        <span className="block font-medium text-brand">{responsible.label}</span>
                        {responsible.kind === "queue" ? null : responsible.detail ? (
                          <span className="block text-xs text-slate-muted">{responsible.detail}</span>
                        ) : null}
                        {l.assignmentDate ? (
                          <span className="block text-xs text-slate-muted">
                            Since {formatDate(l.assignmentDate)}
                          </span>
                        ) : null}
                      </div>
                    </TD>
                    <TD>
                      <LeadQuickContact
                        leadId={l.id}
                        brideName={l.brideName}
                        phone={l.phone}
                        city={l.city}
                        layout="stacked"
                      />
                    </TD>
                    <TD className="text-xs text-slate-muted whitespace-nowrap">
                      {l.createdAt ? formatDate(l.createdAt) : "—"}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setEditLead(l)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setManageLead(l)}>
                          Manage
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPhoneHistoryLead(l)}>
                          History
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              }

              return (
              <TR key={l.id} className="align-top hover:bg-slate-50/80">
                <TD className="text-xs font-mono text-slate-muted">{l.displayId}</TD>
                <TD className="font-medium">{l.brideName}</TD>
                <TD className="text-sm whitespace-nowrap">{l.phone}</TD>
                <TD className="text-sm text-slate-muted">{l.email ?? "—"}</TD>
                <TD className="text-sm">
                  <span>{l.city}</span>
                  <span className="block text-xs capitalize text-slate-muted">
                    {l.region ?? "At verify"}
                  </span>
                  {l.eventLocation && (
                    <span className="block text-xs text-slate-muted">
                      {l.eventLocation}
                    </span>
                  )}
                </TD>
                <TD className="text-sm whitespace-nowrap">
                  {formatDate(l.eventDate)}
                </TD>
                <TD className="max-w-[140px] text-xs text-slate-muted">
                  {l.ceremonies ?? (l.eventCount ? `${l.eventCount} event(s)` : "—")}
                </TD>
                <TD className="text-sm">
                  <span className="font-medium">
                    {BUDGET_TIER_LABELS[l.budgetTier] ?? l.budgetTier}
                  </span>
                  {l.budgetAmount != null && (
                    <span className="block text-xs text-slate-muted">
                      Rs. {Number(l.budgetAmount).toLocaleString("en-IN")}
                    </span>
                  )}
                </TD>
                <TD className="text-sm">{l.source ?? "—"}</TD>
                <TD>
                  {tab === "review" ? (
                    <Badge className="bg-red-100 text-red-800">{LEAD_EXIT_LABELS.uploaderReview}</Badge>
                  ) : tab === "closed" ? (
                    <Badge className="bg-slate-200 text-slate-800">{LEAD_EXIT_LABELS.closed}</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-700">Pending</Badge>
                  )}
                  {(tab === "pending" || tab === "review") &&
                    (l.verificationConnectAttempts ?? 0) > 0 && (
                    <span className="mt-1 block text-xs text-slate-muted">
                      Connect attempts: {l.verificationConnectAttempts}/
                      {MAX_VERIFICATION_CONNECT_ATTEMPTS}
                    </span>
                  )}
                </TD>
                {tab === "review" && (
                  <TD className="max-w-[240px] text-xs text-slate-800">
                    {exitMarkedByLabel(l.exitMarkedByRole) && (
                      <Badge variant="muted" className="mb-1">
                        {exitMarkedByLabel(l.exitMarkedByRole)}
                      </Badge>
                    )}
                    <div>{reviewExitNote(l)}</div>
                  </TD>
                )}
                {tab === "closed" && (
                  <TD className="max-w-[240px] text-xs text-slate-700">
                    {l.handoverReason ?? "—"}
                  </TD>
                )}
                <TD className="text-xs text-slate-muted whitespace-nowrap">
                  {l.createdAt ? formatDate(l.createdAt) : "—"}
                </TD>
                <TD>
                  {tab === "pending" || isWorkflowTab ? (
                    <div className="flex min-w-[8rem] flex-col gap-1">
                      {tab === "review" && (
                        <>
                          <Button size="sm" onClick={() => openReverify(l)}>
                            Re-verify
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openCloseLead(l)}
                          >
                            {LEAD_EXIT_LABELS.closeLead}
                          </Button>
                        </>
                      )}
                      {tab === "closed" && (
                        <>
                          <Button size="sm" onClick={() => setReactivateLead(l)}>
                            {LEAD_EXIT_LABELS.reactivate}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setPhoneHistoryLead(l)}>
                            History
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setNoteLead(l)}>
                            Add note
                          </Button>
                        </>
                      )}
                      {tab === "pending" && (
                        <Button size="sm" onClick={() => setVerifyLead(l)}>
                          Verify
                        </Button>
                      )}
                    </div>
                  ) : null}
                </TD>
              </TR>
              );
            })}
            {leads.length === 0 && (
              <TR>
                <TD
                  colSpan={isVerifiedTab ? 9 : isWorkflowTab ? 13 : 12}
                  className="py-8 text-center text-slate-muted"
                >
                  No leads in this tab
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>

      <VerifyLeadSlideOver
        open={!!verifyLead}
        onClose={() => {
          setVerifyLead(null);
          setForceReVerify(false);
          clearVerifyDeepLink();
        }}
        lead={verifyLead}
        reVerify={tab === "review" || forceReVerify}
        priorContext={
          (tab === "review" || forceReVerify) &&
          verifyLead &&
          !verifyLead.hostileNote?.trim()
            ? verifyLead.handoverReason ?? null
            : null
        }
        notAnsweringNote={
          tab === "review" || forceReVerify ? verifyLead?.hostileNote ?? null : null
        }
        onVerified={(outcome) => {
          const wasReVerify = tab === "review" || forceReVerify;
          const fromClosedReactivate = tab === "closed" && forceReVerify;
          setVerifyLead(null);
          setForceReVerify(false);
          clearVerifyDeepLink();
          if (outcome === "not_interested") {
            toast("Lead closed");
            setTab("closed");
          } else if (outcome === "not_answering") {
            toast(`Marked ${LEAD_EXIT_LABELS.notAnswering.toLowerCase()}`);
            setTab("review");
          } else if (wasReVerify) {
            toast(
              fromClosedReactivate
                ? "Lead reactivated"
                : "Lead re-verified — previous RM/Commission exit was incorrect"
            );
            setTab("verified");
          } else {
            toast("Lead verified");
            setTab("verified");
          }
          load();
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
          setTab("closed");
          load();
        }}
      />

      <VerifyLeadSlideOver
        open={!!editLead}
        onClose={() => setEditLead(null)}
        lead={editLead}
        editOnly
        reVerify
        onVerified={() => {
          toast("Lead updated");
          load();
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

      <VerifiedLeadManageModal
        open={!!manageLead}
        onClose={() => setManageLead(null)}
        leadId={manageLead?.id ?? ""}
        brideName={manageLead?.brideName ?? ""}
        region={manageLead?.region ?? "north"}
        portalOnly={manageLead?.portalOnly}
        status={manageLead?.status ?? "verified"}
        assignedRmId={manageLead?.assignedRmId}
        assignedRmName={manageLead?.assignedRmName}
        onSaved={load}
        onDeactivated={() => setTab("closed")}
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
        onClose={() => {
          setAddOpen(false);
          clearReferralCreateLink();
        }}
        mode="uploader"
        initialBrideName={referralCreate?.brideName}
        initialPhone={referralCreate?.phone}
        initialSource={referralCreate ? FEEDBACK_REFERRAL_LEAD_SOURCE : undefined}
        feedbackReferralId={referralCreate?.referralId}
        onCreated={(leadId) => {
          void (async () => {
            if (referralCreate?.referralId) {
              await fetch("/api/admin/feedback-referrals", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: referralCreate.referralId,
                  status: "picked_up",
                  convertedLeadId: leadId ?? null,
                }),
              });
            }
            setAddOpen(false);
            clearReferralCreateLink();
            setTab("pending");
            load();
          })();
        }}
      />

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative max-h-[95vh] w-full max-w-[940px] overflow-y-auto">
            <button
              type="button"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-2 py-1 text-sm shadow"
              onClick={() => setImportOpen(false)}
            >
              ✕
            </button>
            <LeadImportWizard
              onClose={() => setImportOpen(false)}
              onComplete={() => {
                setImportOpen(false);
                setTab("pending");
                load();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
