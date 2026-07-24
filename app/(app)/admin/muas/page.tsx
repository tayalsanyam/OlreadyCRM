"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import {
  ADMIN_MUA_PAGE_SIZE_DEFAULT,
  ADMIN_MUA_SEGMENT_LABELS,
  type AdminMuaAddedDateBasis,
  type AdminMuaPipelineFilter,
  type AdminMuaSalesRmFilter,
  type AdminMuaSegment,
  type AdminMuaSortBy,
  type AdminMuaSortDir,
} from "@/lib/admin-muas-query";
import { AdminMuasPagination } from "@/components/admin/AdminMuasPagination";
import { AdminMuasQuickViews } from "@/components/admin/AdminMuasQuickViews";
import { AdminMuasSalesFilters } from "@/components/admin/AdminMuasSalesFilters";
import { AdminMuasBulkSalesBar } from "@/components/admin/AdminMuasBulkSalesBar";
import { MuaSalesRmCell, useAssignableSalesStaff } from "@/components/admin/MuaSalesRmCell";
import {
  ADMIN_PLAN_TAG_LABELS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { AdminMuasFiltersBar } from "@/components/admin/AdminMuasFiltersBar";
import { AdminMuasNav } from "@/components/admin/AdminMuasNav";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { AddMuaModal } from "@/components/admin/AddMuaModal";
import { BootstrapSalesPipelineModal } from "@/components/admin/BootstrapSalesPipelineModal";
import { PlanAssignModal } from "@/components/admin/PlanAssignModal";
import type { MuaImportProfile } from "@/lib/mua-import";
import type { AdminPlanAssignPayload } from "@/lib/admin-plan-assign-shared";
import { MuaPlanControlsModal } from "@/components/admin/MuaPlanControlsModal";
import { MuaQuickContact } from "@/components/muas/MuaQuickContact";
import { CapBar } from "@/components/muas/CapBar";
import { MuaImportWizard } from "@/components/import/MuaImportWizard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { resolveMuaRegions, formatRegions } from "@/lib/mua-region";
import { MUA_SOURCE_OPTIONS, type MuaSource } from "@/lib/mua-source";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { PLAN_TIER_LABELS, type PlanTier, type Region } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Tab = "all" | "import" | "plans";

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

function expiryLabel(date: string | null): { text: string; className: string } {
  if (!date) return { text: "—", className: "text-slate-muted" };
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: "Expired", className: "text-red-600 font-semibold" };
  if (days <= 7) return { text: `Expires in ${days}d`, className: "text-red-600 font-semibold" };
  if (days <= 30) return { text: `Expires in ${days}d`, className: "text-amber-600 font-medium" };
  return { text: formatDate(date), className: "text-slate-muted" };
}

function PlanExpiryCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-slate-muted">—</span>;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  const exp = expiryLabel(date);
  const relative = days < 0 ? "Expired" : days <= 30 ? exp.text : null;
  return (
    <div>
      <div className="text-sm tabular-nums text-slate-700">{formatDate(date)}</div>
      {relative ? <div className={cn("text-[11px]", exp.className)}>{relative}</div> : null}
    </div>
  );
}


const SEGMENT_BADGE: Record<AdminMuaSegment, string> = {
  potential: "bg-slate-100 text-slate-700",
  customer: "bg-blue-100 text-blue-800",
  plan_customer: "bg-emerald-100 text-emerald-900",
};

const TAG_BADGE: Record<AdminPlanTag, string> = {
  high_priority: "bg-red-100 text-red-800",
  low_priority: "bg-slate-100 text-slate-600",
  hold: "bg-amber-100 text-amber-900",
};

function isActivePlan(m: AdminMuaListItem): boolean {
  return Boolean(
    m.planTier &&
      (!m.planExpiry ||
        new Date(m.planExpiry) >= new Date(new Date().toDateString())),
  );
}

function needsNewSalesPipeline(m: AdminMuaListItem): boolean {
  return m.status === "active" && !m.hasActiveSalesPipeline;
}

function isInRejectedQueue(m: AdminMuaListItem): boolean {
  return Boolean(m.hasRejectedSalesPipeline);
}

function MuaRejectedQueueNotice({ m }: { m: AdminMuaListItem }) {
  if (!isInRejectedQueue(m)) return null;
  return (
    <Link
      href="/admin/sales/rejected"
      className="text-xs font-medium text-amber-800 hover:underline"
    >
      In rejected queue
      {m.rejectionReason ? ` (${m.rejectionReason})` : ""} — re-assign or junk first
    </Link>
  );
}

function MuaPipelineStageCell({ m }: { m: AdminMuaListItem }) {
  if (isInRejectedQueue(m)) {
    return (
      <div>
        <div className="font-medium text-amber-800">Rejected</div>
        {m.rejectionReason ? (
          <div className="text-[11px] text-slate-muted line-clamp-2">{m.rejectionReason}</div>
        ) : null}
      </div>
    );
  }
  if (m.salesPipelineStage) {
    return (
      <div>
        <div>{m.salesPipelineStage}</div>
        {m.salesPipelineMuaType ? (
          <div className="text-[11px] text-slate-muted">
            {salesPipelineMuaTypeLabel(m.salesPipelineMuaType)}
          </div>
        ) : null}
      </div>
    );
  }
  return <span className="text-slate-muted">—</span>;
}

function MuaRegionalRmCell({
  m,
  planRmOptions,
}: {
  m: AdminMuaListItem;
  planRmOptions?: Array<{ id: string; name: string }>;
}) {
  const name =
    m.planRmName ??
    (m.planRmId ? planRmOptions?.find((r) => r.id === m.planRmId)?.name : null);
  if (name) {
    return <span className="text-sm font-medium text-slate-800">{name}</span>;
  }
  return <span className="text-sm text-slate-muted">—</span>;
}

function MuaCityCell({ m }: { m: AdminMuaListItem }) {
  const regions = resolveMuaRegions(m.regions ?? [], m.city);
  const regionLabel = formatRegions(regions);
  return (
    <div>
      <div className="text-sm">{m.city}</div>
      {regions.length > 0 && regionLabel !== "—" ? (
        <div className="text-[11px] capitalize text-slate-muted">{regionLabel}</div>
      ) : null}
    </div>
  );
}

function MuaRowActions({
  m,
  onAddPipeline,
  onManagePlan,
  onSetRosterStatus,
}: {
  m: AdminMuaListItem;
  onAddPipeline: () => void;
  onManagePlan: () => void;
  onSetRosterStatus?: (status: "active" | "inactive") => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {needsNewSalesPipeline(m) && (
        <button
          type="button"
          className="text-left text-xs font-medium text-accent hover:underline"
          onClick={onAddPipeline}
        >
          Add to sales pipeline
        </button>
      )}
      <MuaRejectedQueueNotice m={m} />
      {onSetRosterStatus && m.status === "active" && (
        <button
          type="button"
          className="text-left text-xs text-slate-muted hover:underline"
          onClick={() => onSetRosterStatus("inactive")}
        >
          Set inactive
        </button>
      )}
      {onSetRosterStatus && m.status === "inactive" && (
        <button
          type="button"
          className="text-left text-xs text-emerald-700 hover:underline"
          onClick={() => onSetRosterStatus("active")}
        >
          Set active
        </button>
      )}
      {isActivePlan(m) && (
        <button
          type="button"
          className="text-left text-xs font-medium text-brand hover:underline"
          onClick={onManagePlan}
        >
          Manage plan
        </button>
      )}
      <Link
        href={`/admin/muas/${m.id}`}
        className="text-xs font-medium text-accent hover:underline"
      >
        View
      </Link>
    </div>
  );
}

function formatSincePlan(m: AdminMuaListItem): string {
  const bookings = m.bookingsSincePlanStart ?? 0;
  if (m.assuredBookings != null && m.assuredBookings > 0) {
    return `${bookings} / ${m.assuredBookings}`;
  }
  return String(bookings);
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: AdminMuaSortDir;
  onClick: () => void;
}) {
  return (
    <TH>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 text-left font-semibold hover:text-brand",
          active && "text-brand",
        )}
        onClick={onClick}
      >
        {label}
        {active ? <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </TH>
  );
}

export default function AdminMuasPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [muas, setMuas] = useState<AdminMuaListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [regionFilter, setRegionFilter] = useState<Region[]>([]);
  const [sourceFilter, setSourceFilter] = useState<MuaSource[]>([]);
  const [tierFilter, setTierFilter] = useState("");
  const [expiryStatusFilter, setExpiryStatusFilter] = useState<
    "all" | "active" | "expiring" | "expired" | "none"
  >("all");
  const [rosterStatusFilter, setRosterStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const [winBackFilter, setWinBackFilter] = useState(false);
  const [allPlanRmFilter, setAllPlanRmFilter] = useState("");
  const [addedDateBasis, setAddedDateBasis] =
    useState<AdminMuaAddedDateBasis | null>(null);
  const [addedFrom, setAddedFrom] = useState("");
  const [addedTo, setAddedTo] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [planModal, setPlanModal] = useState<{
    ids: string[];
    label: string;
  } | null>(null);
  const [planSearch, setPlanSearch] = useState("");
  const [debouncedPlanSearch, setDebouncedPlanSearch] = useState("");
  const [planTierFilters, setPlanTierFilters] = useState<PlanTier[]>([]);
  const [planStatusFilter, setPlanStatusFilter] = useState<
    "all" | "active" | "expiring" | "expired" | "none"
  >("all");
  const [planRmFilter, setPlanRmFilter] = useState("");
  const [planSalesRmStaffFilter, setPlanSalesRmStaffFilter] = useState("");
  const [planDealClosedSalesRmFilter, setPlanDealClosedSalesRmFilter] = useState("");
  const [planStateFilter, setPlanStateFilter] = useState("");
  const [planRmOptions, setPlanRmOptions] = useState<
    { id: string; name: string; region: string }[]
  >([]);
  const [planRegionFilter, setPlanRegionFilter] = useState<Region[]>([]);
  const [planView, setPlanView] = useState<"cards" | "list">("cards");
  const [searchQ, setSearchQ] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<AdminMuaSegment | "all">("all");
  const [appliedSegment, setAppliedSegment] = useState<AdminMuaSegment | "all">("all");
  const [tagFilter, setTagFilter] = useState<AdminPlanTag | "all">("all");
  const [appliedTag, setAppliedTag] = useState<AdminPlanTag | "all">("all");
  const [loading, setLoading] = useState(true);
  const [planControlsMua, setPlanControlsMua] = useState<AdminMuaListItem | null>(
    null,
  );
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [pipelineModalMuas, setPipelineModalMuas] = useState<AdminMuaListItem[]>([]);
  const [bulkRosterSaving, setBulkRosterSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [listMeta, setListMeta] = useState({
    onPlan: 0,
    expiring: 0,
    needsSalesRm: 0,
    missingPipeline: 0,
  });
  const [salesRmFilter, setSalesRmFilter] = useState<AdminMuaSalesRmFilter>("all");
  const [pipelineFilter, setPipelineFilter] = useState<AdminMuaPipelineFilter>("all");
  const [salesRmStaffFilter, setSalesRmStaffFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [pipelineStageFilter, setPipelineStageFilter] = useState("");
  const [sortBy, setSortBy] = useState<AdminMuaSortBy>("name");
  const [sortDir, setSortDir] = useState<AdminMuaSortDir>("asc");
  const assignableSalesStaff = useAssignableSalesStaff();

  useEffect(() => {
    void fetch("/api/admin/rms")
      .then((r) => r.json())
      .then((json: { data?: { id: string; name: string; region: string }[] }) => {
        setPlanRmOptions(json.data ?? []);
      })
      .catch(() => setPlanRmOptions([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPlanSearch(planSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [planSearch]);

  const buildListParams = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("pageSize", String(ADMIN_MUA_PAGE_SIZE_DEFAULT));

      if (tab === "all") {
        if (appliedSearch) params.set("q", appliedSearch);
        if (appliedSegment !== "all") params.set("segment", appliedSegment);
        if (appliedTag !== "all") params.set("tag", appliedTag);
        regionFilter.forEach((r) => params.append("region", r));
        sourceFilter.forEach((s) => params.append("source", s));
        if (tierFilter) params.set("tier", tierFilter);
        if (expiryStatusFilter !== "all") params.set("expiryStatus", expiryStatusFilter);
        if (rosterStatusFilter !== "all") params.set("rosterStatus", rosterStatusFilter);
        if (winBackFilter) params.set("winBack", "1");
        if (addedDateBasis && (addedFrom || addedTo)) {
          params.set("addedDateBasis", addedDateBasis);
          if (addedFrom) params.set("addedFrom", addedFrom);
          if (addedTo) params.set("addedTo", addedTo);
        }
        if (allPlanRmFilter) params.set("planRm", allPlanRmFilter);
        if (salesRmFilter !== "all") params.set("salesRm", salesRmFilter);
        if (pipelineFilter !== "all") params.set("pipeline", pipelineFilter);
        if (salesRmStaffFilter) params.set("salesRmStaff", salesRmStaffFilter);
        if (teamFilter) params.set("teamId", teamFilter);
        if (stateFilter) params.set("state", stateFilter);
        if (pipelineStageFilter) params.set("stage", pipelineStageFilter);
        if (sortBy !== "name") params.set("sortBy", sortBy);
        if (sortDir !== "asc") params.set("sortDir", sortDir);
      } else if (tab === "plans") {
        if (debouncedPlanSearch) params.set("q", debouncedPlanSearch);
        planRegionFilter.forEach((r) => params.append("region", r));
        planTierFilters.forEach((t) => params.append("tier", t));
        if (planStatusFilter !== "all") params.set("expiryStatus", planStatusFilter);
        if (planRmFilter) params.set("planRm", planRmFilter);
        if (planSalesRmStaffFilter) params.set("salesRmStaff", planSalesRmStaffFilter);
        if (planDealClosedSalesRmFilter) {
          params.set("dealClosedSalesRm", planDealClosedSalesRmFilter);
        }
        if (planStateFilter) params.set("state", planStateFilter);
      }

      return params;
    },
    [
      tab,
      appliedSearch,
      appliedSegment,
      appliedTag,
      regionFilter,
      sourceFilter,
      tierFilter,
      expiryStatusFilter,
      rosterStatusFilter,
      winBackFilter,
      addedDateBasis,
      addedFrom,
      addedTo,
      allPlanRmFilter,
      salesRmFilter,
      pipelineFilter,
      salesRmStaffFilter,
      teamFilter,
      stateFilter,
      pipelineStageFilter,
      sortBy,
      sortDir,
      debouncedPlanSearch,
      planRegionFilter,
      planTierFilters,
      planStatusFilter,
      planRmFilter,
      planSalesRmStaffFilter,
      planDealClosedSalesRmFilter,
      planStateFilter,
    ],
  );

  const exportQuery = useMemo(() => {
    if (tab !== "all") return "";
    const params = buildListParams(1);
    params.delete("page");
    params.delete("pageSize");
    return params.toString();
  }, [tab, buildListParams]);

  const toggleSort = useCallback(
    (column: AdminMuaSortBy) => {
      setPage(1);
      if (sortBy === column) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortDir(column === "name" ? "asc" : "desc");
      }
    },
    [sortBy],
  );

  const load = useCallback(() => {
    if (tab === "import") return;
    setLoading(true);
    const params = buildListParams(page);

    void fetch(`/api/admin/muas?${params}`)
      .then(async (r) => {
        const text = await r.text();
        if (!text) {
          throw new Error(r.ok ? "Empty response from server" : `Request failed (${r.status})`);
        }
        const json = JSON.parse(text) as {
          data?: {
            items: AdminMuaListItem[];
            total: number;
            page: number;
            pageSize: number;
            totalPages: number;
          };
          meta?: {
            onPlan: number;
            expiring: number;
            needsSalesRm?: number;
            missingPipeline?: number;
          };
          error?: string | null;
        };
        if (!r.ok) {
          throw new Error(json.error ?? `Request failed (${r.status})`);
        }
        return json;
      })
      .then((json) => {
        setMuas(json.data?.items ?? []);
        setTotal(json.data?.total ?? 0);
        setTotalPages(json.data?.totalPages ?? 1);
        setListMeta({
          onPlan: json.meta?.onPlan ?? 0,
          expiring: json.meta?.expiring ?? 0,
          needsSalesRm: json.meta?.needsSalesRm ?? 0,
          missingPipeline: json.meta?.missingPipeline ?? 0,
        });
      })
      .catch((err: unknown) => {
        console.error("[admin/muas load]", err);
        toast(err instanceof Error ? err.message : "Failed to load MUAs", "error");
        setMuas([]);
        setTotal(0);
        setTotalPages(1);
        setListMeta({ onPlan: 0, expiring: 0, needsSalesRm: 0, missingPipeline: 0 });
      })
      .finally(() => setLoading(false));
  }, [
    tab,
    page,
    buildListParams,
    toast,
  ]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "import" || t === "plans" || t === "all") {
      setTab(t);
    } else {
      setTab("all");
    }

    const salesRmRaw = searchParams.get("salesRm");
    setSalesRmFilter(
      salesRmRaw === "unassigned" || salesRmRaw === "assigned" ? salesRmRaw : "all",
    );
    const pipelineRaw = searchParams.get("pipeline");
    setPipelineFilter(pipelineRaw === "missing" || pipelineRaw === "has" ? pipelineRaw : "all");

    const segmentRaw = searchParams.get("segment");
    if (
      segmentRaw === "potential" ||
      segmentRaw === "customer" ||
      segmentRaw === "plan_customer"
    ) {
      setSegmentFilter(segmentRaw);
      setAppliedSegment(segmentRaw);
    }

    const staffRaw = searchParams.get("salesRmStaff") ?? searchParams.get("assigned_to") ?? "";
    setSalesRmStaffFilter(staffRaw);
    setTeamFilter(searchParams.get("teamId") ?? searchParams.get("team_id") ?? "");
    setStateFilter(searchParams.get("state") ?? "");
    setPipelineStageFilter(searchParams.get("stage") ?? "");

    const expiryRaw = searchParams.get("expiryStatus");
    if (
      expiryRaw === "active" ||
      expiryRaw === "expiring" ||
      expiryRaw === "expired" ||
      expiryRaw === "none"
    ) {
      setExpiryStatusFilter(expiryRaw);
    }

    const rosterRaw = searchParams.get("rosterStatus");
    if (rosterRaw === "all" || rosterRaw === "active" || rosterRaw === "inactive") {
      setRosterStatusFilter(rosterRaw);
    } else if (rosterRaw === "lapsed") {
      setWinBackFilter(true);
      setRosterStatusFilter("all");
    }

    setWinBackFilter(
      searchParams.get("winBack") === "1" ||
        searchParams.get("reEngage") === "1" ||
        rosterRaw === "lapsed",
    );

    const qRaw = searchParams.get("q")?.trim() ?? "";
    if (qRaw) {
      setSearchQ(qRaw);
      setAppliedSearch(qRaw);
    }

    const sourceRaw = searchParams
      .getAll("source")
      .filter((s): s is MuaSource => (MUA_SOURCE_OPTIONS as readonly string[]).includes(s));
    if (sourceRaw.length > 0) {
      setSourceFilter(sourceRaw);
    }
  }, [searchParams]);

  const importProfile = useMemo((): MuaImportProfile => {
    const p = searchParams.get("profile");
    if (p === "roster" || p === "plan_customer" || p === "prospect") return p;
    return "prospect";
  }, [searchParams]);

  const goToTab = useCallback(
    (next: Tab, profile?: MuaImportProfile) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") {
        params.delete("tab");
        params.delete("profile");
      } else {
        params.set("tab", next);
        if (next === "import") {
          params.set("profile", profile ?? importProfile);
        } else {
          params.delete("profile");
        }
      }
      const qs = params.toString();
      router.push(qs ? `/admin/muas?${qs}` : "/admin/muas");
    },
    [router, searchParams, importProfile],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [
    tab,
    appliedSearch,
    appliedSegment,
    appliedTag,
    regionFilter,
    sourceFilter,
    tierFilter,
    expiryStatusFilter,
    rosterStatusFilter,
    addedDateBasis,
    addedFrom,
    addedTo,
    allPlanRmFilter,
    salesRmFilter,
    pipelineFilter,
    salesRmStaffFilter,
    teamFilter,
    stateFilter,
    pipelineStageFilter,
    debouncedPlanSearch,
    planRegionFilter,
    planTierFilters,
    planStatusFilter,
    planRmFilter,
    planSalesRmStaffFilter,
    planDealClosedSalesRmFilter,
    planStateFilter,
  ]);

  const applyQuickView = useCallback(
    (next: {
      salesRm: AdminMuaSalesRmFilter;
      pipeline: AdminMuaPipelineFilter;
      segment: AdminMuaSegment | "all";
    }) => {
      setSalesRmFilter(next.salesRm);
      setPipelineFilter(next.pipeline);
      setSegmentFilter(next.segment);
      setAppliedSegment(next.segment);
      setPage(1);

      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      if (next.salesRm === "all") params.delete("salesRm");
      else params.set("salesRm", next.salesRm);
      if (next.pipeline === "all") params.delete("pipeline");
      else params.set("pipeline", next.pipeline);
      if (next.segment === "all") params.delete("segment");
      else params.set("segment", next.segment);
      const qs = params.toString();
      router.replace(qs ? `/admin/muas?${qs}` : "/admin/muas");
    },
    [router, searchParams],
  );

  function applySearchFilters() {
    setAppliedSearch(searchQ.trim());
    setAppliedSegment(segmentFilter);
    setAppliedTag(tagFilter);
    setPage(1);
  }

  function clearSearchFilters() {
    setSearchQ("");
    setSegmentFilter("all");
    setTagFilter("all");
    setAppliedSearch("");
    setAppliedSegment("all");
    setAppliedTag("all");
  }

  function clearClientFilters() {
    setRegionFilter([]);
    setSourceFilter([]);
    setTierFilter("");
    setExpiryStatusFilter("all");
    setRosterStatusFilter("active");
    setAddedDateBasis(null);
    setAddedFrom("");
    setAddedTo("");
    setAllPlanRmFilter("");
    setSalesRmStaffFilter("");
    setTeamFilter("");
    setStateFilter("");
    setPipelineStageFilter("");
    setSalesRmFilter("all");
    setPipelineFilter("all");
    applyQuickView({ salesRm: "all", pipeline: "all", segment: appliedSegment });
  }

  function syncSalesFiltersToUrl(patch: {
    salesRmStaffId?: string;
    teamId?: string;
    state?: string;
    pipelineStage?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const staff = patch.salesRmStaffId ?? salesRmStaffFilter;
    const team = patch.teamId ?? teamFilter;
    const st = patch.state ?? stateFilter;
    const stage = patch.pipelineStage ?? pipelineStageFilter;
    if (staff) params.set("salesRmStaff", staff);
    else params.delete("salesRmStaff");
    if (team) params.set("teamId", team);
    else params.delete("teamId");
    if (st) params.set("state", st);
    else params.delete("state");
    if (stage) params.set("stage", stage);
    else params.delete("stage");
    params.delete("assigned_to");
    params.delete("team_id");
    const qs = params.toString();
    router.replace(qs ? `/admin/muas?${qs}` : "/admin/muas");
    setPage(1);
  }

  const setRosterStatus = useCallback(
    async (m: AdminMuaListItem, status: "active" | "inactive") => {
      const res = await fetch(`/api/muas/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast(json.error ?? "Could not update roster status", "error");
        return;
      }
      toast(status === "inactive" ? `${m.name} set inactive` : `${m.name} set active`);
      load();
    },
    [load, toast],
  );

  const bulkRosterStatus = useCallback(
    async (status: "active" | "inactive") => {
      const ids = [...selected];
      if (!ids.length) return;
      setBulkRosterSaving(true);
      try {
        const res = await fetch("/api/admin/muas/bulk-roster", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ muaIds: ids, status }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          data?: { updated?: number };
        };
        if (!res.ok) {
          toast(json.error ?? "Bulk roster update failed", "error");
          return;
        }
        const count = json.data?.updated ?? ids.length;
        toast(
          status === "inactive"
            ? `${count} MUA${count === 1 ? "" : "s"} set inactive`
            : `${count} MUA${count === 1 ? "" : "s"} set active`,
        );
        setSelected(new Set());
        load();
      } finally {
        setBulkRosterSaving(false);
      }
    },
    [selected, load, toast],
  );

  function clearPlanFilters() {
    setPlanSearch("");
    setPlanRegionFilter([]);
    setPlanTierFilters([]);
    setPlanStatusFilter("all");
    setPlanRmFilter("");
    setPlanSalesRmStaffFilter("");
    setPlanDealClosedSalesRmFilter("");
    setPlanStateFilter("");
  }

  const hasServerFilters =
    Boolean(appliedSearch) || appliedSegment !== "all" || appliedTag !== "all";

  const hasClientFilters =
    regionFilter.length > 0 ||
    sourceFilter.length > 0 ||
    Boolean(tierFilter) ||
    expiryStatusFilter !== "all" ||
    rosterStatusFilter !== "active" ||
    winBackFilter ||
    Boolean(allPlanRmFilter) ||
    Boolean(addedDateBasis && (addedFrom || addedTo)) ||
    Boolean(salesRmStaffFilter) ||
    Boolean(teamFilter) ||
    Boolean(stateFilter) ||
    Boolean(pipelineStageFilter) ||
    salesRmFilter !== "all" ||
    pipelineFilter !== "all";

  const hasPlanFilters =
    Boolean(planSearch) ||
    planRegionFilter.length > 0 ||
    planTierFilters.length > 0 ||
    planStatusFilter !== "all" ||
    Boolean(planRmFilter) ||
    Boolean(planSalesRmStaffFilter) ||
    Boolean(planDealClosedSalesRmFilter) ||
    Boolean(planStateFilter);

  function toggleSelectAllVisible(ids: string[]) {
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleSelectAllAllMuas() {
    toggleSelectAllVisible(muas.map((m) => m.id));
  }

  function toggleSelectAllPlanList() {
    toggleSelectAllVisible(muas.map((m) => m.id));
  }

  const stats = listMeta;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function planAssignInitial(
    ids: string[],
  ): Partial<AdminPlanAssignPayload> & { planTier?: PlanTier | null } | undefined {
    if (ids.length !== 1) return undefined;
    const m = muas.find((x) => x.id === ids[0]);
    if (!m) return undefined;
    return {
      planTier: m.planTier,
      planExpiry: m.planExpiry,
      city: m.city,
      instagram: m.instagram ?? undefined,
      leadCap: m.leadCap,
      leadBudget: m.leadBudget ?? undefined,
      states: m.planStates,
      regions: resolveMuaRegions(m.regions ?? [], m.city),
      cities: m.planCities.length ? m.planCities : m.city ? [m.city] : [],
    };
  }

  const selectedMuas = useMemo(
    () => muas.filter((m) => selected.has(m.id)),
    [muas, selected],
  );

  const openPipelineModal = useCallback(
    (candidates?: AdminMuaListItem[]) => {
      let targets =
        candidates ??
        (selected.size > 0 ? selectedMuas : []);
      if (!targets.length) {
        if (tab === "all") targets = muas.filter(needsNewSalesPipeline);
        else if (tab === "plans") targets = muas.filter(needsNewSalesPipeline);
      }
      if (!targets.length) {
        toast("No MUAs need a sales pipeline or salesperson", "error");
        return;
      }
      setPipelineModalMuas(targets);
      setPipelineModalOpen(true);
    },
    [selected.size, selectedMuas, tab, muas, toast],
  );

  const bulkSelectionBar =
    selected.size > 0 ? (
      <div className="sticky top-0 z-10 space-y-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{selected.size} MUAs selected</span>
          <Button
            size="sm"
            onClick={() =>
              setPlanModal({
                ids: [...selected],
                label: `${selected.size} MUAs`,
              })
            }
          >
            Assign plan
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openPipelineModal()}>
            Add to sales pipeline
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkRosterSaving}
            onClick={() => void bulkRosterStatus("inactive")}
          >
            Set inactive
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkRosterSaving}
            onClick={() => void bulkRosterStatus("active")}
          >
            Set active
          </Button>
          <button
            type="button"
            className="text-sm text-accent"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
        <AdminMuasBulkSalesBar
          selected={selectedMuas}
          staff={assignableSalesStaff}
          onDone={() => {
            setSelected(new Set());
            load();
          }}
        />
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <AdminMuasNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">Manage MUAs</h1>
        <div className="flex flex-wrap gap-2">
          <AdminExportCsvButton
            apiPath="/api/admin/muas/export"
            query={exportQuery}
            label="Download CSV"
          />
          <Button variant="secondary" onClick={() => goToTab("import")}>
            Upload MUAs
          </Button>
          <Button onClick={() => setAddOpen(true)}>Add MUA</Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            ["all", "All MUAs"],
            ["plans", "Plan Assignment"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => goToTab(id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === id ? "border-brand text-brand" : "border-transparent text-slate-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "all" && (
        <>
          {bulkSelectionBar}

          <AdminMuasQuickViews
            value={{
              salesRm: salesRmFilter,
              pipeline: pipelineFilter,
              segment: appliedSegment,
            }}
            counts={{
              needsSalesRm: listMeta.needsSalesRm,
              missingPipeline: listMeta.missingPipeline,
            }}
            onChange={applyQuickView}
          />

          <AdminMuasSalesFilters
            salesRmStaffId={salesRmStaffFilter}
            teamId={teamFilter}
            state={stateFilter}
            pipelineStage={pipelineStageFilter}
            onSalesRmStaffIdChange={(v) => {
              setSalesRmStaffFilter(v);
              syncSalesFiltersToUrl({ salesRmStaffId: v });
            }}
            onTeamIdChange={(v) => {
              setTeamFilter(v);
              syncSalesFiltersToUrl({ teamId: v });
            }}
            onStateChange={(v) => {
              setStateFilter(v);
              syncSalesFiltersToUrl({ state: v });
            }}
            onPipelineStageChange={(v) => {
              setPipelineStageFilter(v);
              syncSalesFiltersToUrl({ pipelineStage: v });
            }}
          />

          <AdminMuasFiltersBar
            variant="all"
            searchQ={searchQ}
            onSearchQChange={setSearchQ}
            onSearchApply={applySearchFilters}
            segment={segmentFilter}
            onSegmentChange={(id) => {
              setSegmentFilter(id);
              setAppliedSegment(id);
            }}
            tag={tagFilter}
            onTagChange={(t) => {
              setTagFilter(t);
              setAppliedTag(t);
            }}
            region={regionFilter}
            onRegionChange={setRegionFilter}
            sources={sourceFilter}
            onSourcesChange={setSourceFilter}
            tier={tierFilter}
            onTierChange={setTierFilter}
            expiryStatus={expiryStatusFilter}
            onExpiryChange={setExpiryStatusFilter}
            rosterStatus={rosterStatusFilter}
            onRosterStatusChange={setRosterStatusFilter}
            winBack={winBackFilter}
            onWinBackChange={setWinBackFilter}
            addedDateBasis={addedDateBasis}
            onAddedDateBasisChange={setAddedDateBasis}
            addedFrom={addedFrom}
            onAddedFromChange={setAddedFrom}
            addedTo={addedTo}
            onAddedToChange={setAddedTo}
            planRm={allPlanRmFilter}
            onPlanRmChange={(v) => {
              setAllPlanRmFilter(v);
              setPage(1);
            }}
            planRmOptions={planRmOptions}
            resultCount={total}
            totalCount={total}
            loading={loading}
            hasServerFilters={hasServerFilters}
            onClearServerFilters={clearSearchFilters}
            onClearClientFilters={clearClientFilters}
            hasClientFilters={hasClientFilters}
          />

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <Table>
            <THead>
              <TR className="bg-slate-50">
                <TH>
                  <input
                    type="checkbox"
                    checked={
                      muas.length > 0 &&
                      muas.every((m) => selected.has(m.id))
                    }
                    onChange={toggleSelectAllAllMuas}
                    aria-label="Select all visible MUAs"
                  />
                </TH>
                <TH>ID</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Contact</TH>
                <TH>Sales RM</TH>
                <TH>Regional RM</TH>
                <TH>Stage</TH>
                <SortableTh
                  label="Days unassigned"
                  active={sortBy === "daysUnassigned"}
                  dir={sortDir}
                  onClick={() => toggleSort("daysUnassigned")}
                />
                <SortableTh
                  label="Days since update"
                  active={sortBy === "daysSinceUpdate"}
                  dir={sortDir}
                  onClick={() => toggleSort("daysSinceUpdate")}
                />
                <TH>City</TH>
                <TH>Segment</TH>
                <TH>Tag</TH>
                <TH>Plan</TH>
                <TH>Weekly cap</TH>
                <TH>Pushes till date</TH>
                <TH>Bookings</TH>
                <TH>Since plan</TH>
                <TH>Revenue</TH>
                <TH>Plan expiry</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {muas.length === 0 ? (
                <TR>
                  <TD colSpan={21} className="py-10 text-center text-sm text-slate-muted">
                    No MUAs match the current filters.
                  </TD>
                </TR>
              ) : (
              muas.map((m) => {
                return (
                  <TR key={m.id} className="hover:bg-slate-50/80">
                    <TD>
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                      />
                    </TD>
                    <TD className="font-mono text-[11px] text-slate-muted">{m.displayId}</TD>
                    <TD>
                      <div className="font-medium text-brand">{m.name}</div>
                    </TD>
                    <TD>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                          m.status === "active"
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {m.status}
                      </span>
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
                      />
                    </TD>
                    <TD>
                      <MuaSalesRmCell m={m} staff={assignableSalesStaff} onUpdated={load} />
                    </TD>
                    <TD>
                      <MuaRegionalRmCell m={m} planRmOptions={planRmOptions} />
                    </TD>
                    <TD className="text-sm">
                      <MuaPipelineStageCell m={m} />
                    </TD>
                    <TD className="tabular-nums text-sm">
                      {m.daysUnassigned != null ? (
                        <span className="font-medium text-amber-700">{m.daysUnassigned}d</span>
                      ) : (
                        <span className="text-slate-muted">—</span>
                      )}
                    </TD>
                    <TD className="tabular-nums text-sm text-slate-muted">
                      {m.daysSinceStageUpdate != null ? `${m.daysSinceStageUpdate}d` : "—"}
                    </TD>
                    <TD className="text-sm">
                      <MuaCityCell m={m} />
                    </TD>
                    <TD>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          SEGMENT_BADGE[m.segment],
                        )}
                      >
                        {ADMIN_MUA_SEGMENT_LABELS[m.segment]}
                      </span>
                    </TD>
                    <TD>
                      {m.adminPlanTag ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            TAG_BADGE[m.adminPlanTag],
                          )}
                        >
                          {ADMIN_PLAN_TAG_LABELS[m.adminPlanTag]}
                        </span>
                      ) : (
                        <span className="text-slate-muted">—</span>
                      )}
                    </TD>
                    <TD>
                      {m.planTier ? (
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-xs font-medium",
                            PLAN_BADGE[m.planTier]
                          )}
                        >
                          {PLAN_TIER_LABELS[m.planTier]}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <CapBar used={m.weeklyUsed} cap={m.weeklyCap} />
                    </TD>
                    <TD className="tabular-nums text-sm font-medium">
                      {m.pushesSincePlanStart ?? 0}
                    </TD>
                    <TD className="tabular-nums text-sm">
                      {m.totalBookings ?? 0}
                    </TD>
                    <TD className="tabular-nums text-sm text-slate-muted" title="Bookings since plan start">
                      {formatSincePlan(m)}
                    </TD>
                    <TD className="tabular-nums text-sm">
                      ₹{Number(m.totalBookingRevenue ?? 0).toLocaleString("en-IN")}
                    </TD>
                    <TD>
                      <PlanExpiryCell date={m.planExpiry} />
                    </TD>
                    <TD>
                      <MuaRowActions
                        m={m}
                        onAddPipeline={() => openPipelineModal([m])}
                        onManagePlan={() => setPlanControlsMua(m)}
                        onSetRosterStatus={(status) => void setRosterStatus(m, status)}
                      />
                    </TD>
                  </TR>
                );
              })
              )}
            </TBody>
          </Table>
          <AdminMuasPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={ADMIN_MUA_PAGE_SIZE_DEFAULT}
            loading={loading}
            onPageChange={setPage}
          />
          </div>
        </>
      )}

      {tab === "import" && (
        <MuaImportWizard
          initialProfile={importProfile}
          onClose={() => goToTab("all")}
          onComplete={load}
        />
      )}

      {tab === "plans" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-brand">Plan Assignment</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                {stats.onPlan} MUAs on active plans
              </span>
              {stats.expiring > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">
                  {stats.expiring} plans expiring this month
                </span>
              )}
            </div>
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {(
                [
                  ["cards", "Card view"],
                  ["list", "List view"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlanView(id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium",
                    planView === id
                      ? "bg-brand text-white"
                      : "text-slate-muted hover:bg-slate-50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {bulkSelectionBar}

          <AdminMuasFiltersBar
            variant="plans"
            search={planSearch}
            onSearchChange={setPlanSearch}
            region={planRegionFilter}
            onRegionChange={setPlanRegionFilter}
            tierFilters={planTierFilters}
            onTierToggle={(t) =>
              setPlanTierFilters((prev) =>
                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
              )
            }
            status={planStatusFilter}
            onStatusChange={setPlanStatusFilter}
            resultCount={total}
            totalCount={total}
            onClear={clearPlanFilters}
            hasActiveFilters={hasPlanFilters}
            planRm={planRmFilter}
            onPlanRmChange={(v) => {
              setPlanRmFilter(v);
              setPage(1);
            }}
            planRmOptions={planRmOptions}
            salesRmStaffId={planSalesRmStaffFilter}
            onSalesRmStaffIdChange={(v) => {
              setPlanSalesRmStaffFilter(v);
              setPage(1);
            }}
            dealClosedSalesRmStaffId={planDealClosedSalesRmFilter}
            onDealClosedSalesRmStaffIdChange={(v) => {
              setPlanDealClosedSalesRmFilter(v);
              setPage(1);
            }}
            state={planStateFilter}
            onStateChange={(v) => {
              setPlanStateFilter(v);
              setPage(1);
            }}
          />

          {planView === "cards" && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {muas.map((m) => {
                return (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-brand">{m.name}</h3>
                      <MuaQuickContact
                        muaId={m.id}
                        muaName={m.name}
                        muaPhone={m.phone}
                        muaWhatsapp={m.whatsapp}
                        muaCity={m.city}
                        pipelineId={m.salesPipelineId}
                      />
                    </div>
                    <p className="text-sm text-slate-muted">
                      {m.city} · {formatRegions(m.regions)}
                    </p>
                    <p className="mt-1 text-xs text-slate-muted">
                      Plan RM: {m.planRmName ?? "—"} · Sales RM:{" "}
                      {m.salesRmName ?? (m.salesRmId ? "Assigned" : "—")}
                    </p>
                    <div className="mt-2">
                      {m.planTier ? (
                        <Badge>{PLAN_TIER_LABELS[m.planTier]}</Badge>
                      ) : (
                        <Badge variant="muted">No plan</Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      <PlanExpiryCell date={m.planExpiry} />
                    </div>
                    <div className="mt-3">
                      <CapBar used={m.weeklyUsed} cap={m.weeklyCap} />
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3 w-full"
                      onClick={() =>
                        setPlanModal({ ids: [m.id], label: m.name })
                      }
                    >
                      Change plan
                    </Button>
                    {needsNewSalesPipeline(m) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 w-full"
                        onClick={() => openPipelineModal([m])}
                      >
                        Add to sales pipeline
                      </Button>
                    )}
                    {isInRejectedQueue(m) && (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                        <MuaRejectedQueueNotice m={m} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {planView === "cards" && (
            <AdminMuasPagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={ADMIN_MUA_PAGE_SIZE_DEFAULT}
              loading={loading}
              onPageChange={setPage}
            />
          )}

          {planView === "list" && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <Table>
              <THead>
                <TR className="bg-slate-50">
                  <TH>
                    <input
                      type="checkbox"
                      checked={
                        muas.length > 0 &&
                        muas.every((m) => selected.has(m.id))
                      }
                      onChange={toggleSelectAllPlanList}
                      aria-label="Select all visible MUAs"
                    />
                  </TH>
                  <TH>ID</TH>
                  <TH>Name</TH>
                  <TH>Contact</TH>
                  <TH>Sales RM</TH>
                  <TH>Plan RM</TH>
                  <TH>Assigned RM</TH>
                  <TH>City</TH>
                  <TH>Segment</TH>
                  <TH>Tag</TH>
                  <TH>Plan</TH>
                  <TH>Weekly cap</TH>
                  <TH>Pushes till date</TH>
                  <TH>Bookings</TH>
                  <TH>Since plan</TH>
                  <TH>Revenue</TH>
                  <TH>Plan expiry</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {muas.length === 0 ? (
                  <TR>
                    <TD colSpan={18} className="py-8 text-center text-sm text-slate-muted">
                      No MUAs match the current filters.
                    </TD>
                  </TR>
                ) : (
                  muas.map((m) => {
                    return (
                      <TR key={m.id} className="hover:bg-slate-50/80">
                        <TD>
                          <input
                            type="checkbox"
                            checked={selected.has(m.id)}
                            onChange={() => toggleSelect(m.id)}
                          />
                        </TD>
                        <TD className="font-mono text-[11px] text-slate-muted">{m.displayId}</TD>
                        <TD className="font-medium text-brand">{m.name}</TD>
                        <TD>
                          <MuaQuickContact
                            muaId={m.id}
                            muaName={m.name}
                            muaPhone={m.phone}
                            muaWhatsapp={m.whatsapp}
                            muaCity={m.city}
                            pipelineId={m.salesPipelineId}
                            layout="stacked"
                          />
                        </TD>
                        <TD>
                      <MuaSalesRmCell m={m} staff={assignableSalesStaff} onUpdated={load} />
                    </TD>
                        <TD className="text-sm text-slate-muted">{m.planRmName ?? "—"}</TD>
                        <TD className="text-sm text-slate-muted">{m.assignedRmName ?? "—"}</TD>
                        <TD className="text-sm">
                      <MuaCityCell m={m} />
                    </TD>
                        <TD>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              SEGMENT_BADGE[m.segment],
                            )}
                          >
                            {ADMIN_MUA_SEGMENT_LABELS[m.segment]}
                          </span>
                        </TD>
                        <TD>
                          {m.adminPlanTag ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                TAG_BADGE[m.adminPlanTag],
                              )}
                            >
                              {ADMIN_PLAN_TAG_LABELS[m.adminPlanTag]}
                            </span>
                          ) : (
                            <span className="text-slate-muted">—</span>
                          )}
                        </TD>
                        <TD>
                          {m.planTier ? (
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-xs font-medium",
                                PLAN_BADGE[m.planTier]
                              )}
                            >
                              {PLAN_TIER_LABELS[m.planTier]}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD>
                          <CapBar used={m.weeklyUsed} cap={m.weeklyCap} />
                        </TD>
                        <TD className="tabular-nums text-sm font-medium">
                          {m.pushesSincePlanStart ?? 0}
                        </TD>
                        <TD className="tabular-nums text-sm">
                          {m.totalBookings ?? 0}
                        </TD>
                        <TD className="tabular-nums text-sm text-slate-muted" title="Bookings since plan start">
                          {formatSincePlan(m)}
                        </TD>
                        <TD className="tabular-nums text-sm">
                          ₹{Number(m.totalBookingRevenue ?? 0).toLocaleString("en-IN")}
                        </TD>
                        <TD>
                          <PlanExpiryCell date={m.planExpiry} />
                        </TD>
                        <TD>
                          <div className="flex flex-col gap-1">
                            {needsNewSalesPipeline(m) && (
                              <button
                                type="button"
                                className="text-left text-xs font-medium text-accent hover:underline"
                                onClick={() => openPipelineModal([m])}
                              >
                                Add to sales pipeline
                              </button>
                            )}
                            {isInRejectedQueue(m) && <MuaRejectedQueueNotice m={m} />}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setPlanModal({ ids: [m.id], label: m.name })
                              }
                            >
                              Change plan
                            </Button>
                            {isActivePlan(m) && (
                              <button
                                type="button"
                                className="text-left text-xs font-medium text-brand hover:underline"
                                onClick={() => setPlanControlsMua(m)}
                              >
                                Manage plan
                              </button>
                            )}
                            <Link
                              href={`/admin/muas/${m.id}`}
                              className="text-xs font-medium text-accent hover:underline"
                            >
                              View
                            </Link>
                          </div>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
            <AdminMuasPagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={ADMIN_MUA_PAGE_SIZE_DEFAULT}
              loading={loading}
              onPageChange={setPage}
            />
            </div>
          )}
        </div>
      )}

      <MuaPlanControlsModal
        open={!!planControlsMua}
        onClose={() => setPlanControlsMua(null)}
        mua={planControlsMua}
        onSuccess={load}
      />

      <BootstrapSalesPipelineModal
        open={pipelineModalOpen}
        onClose={() => {
          setPipelineModalOpen(false);
          setPipelineModalMuas([]);
        }}
        muas={pipelineModalMuas}
        onSuccess={() => {
          setSelected(new Set());
          setPipelineModalMuas([]);
          load();
        }}
      />

      {planModal && (
        <PlanAssignModal
          open={!!planModal}
          onClose={() => setPlanModal(null)}
          muaIds={planModal.ids}
          muaLabel={planModal.label}
          initial={planAssignInitial(planModal.ids)}
          onSuccess={() => {
            toast(`Plan assigned to ${planModal.label}`);
            setSelected(new Set());
            load();
          }}
        />
      )}

      <AddMuaModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={load}
      />
    </div>
  );
}
