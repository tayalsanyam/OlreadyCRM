"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
  List,
  Loader2,
  Activity,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { BulkActionBar } from "@/components/leads/BulkActionBar";
import { LeadQuickContact } from "@/components/leads/LeadQuickContact";
import { MyMonthCard } from "@/components/rm/MyMonthCard";
import { PipelineHealthKanban } from "@/components/leads/PipelineHealthKanban";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { formatLeadRegion } from "@/lib/mua-region";
import { toSearchParams, valueFromSearchParams } from "@/lib/date-range";
import type { DateRangeFilterValue, PipelineHealthLead } from "@/lib/types";
import type {
  LeadFull,
  MuaPushStage,
  UrgencyBand,
  BudgetTier,
  UserRole,
} from "@/lib/types";
import {
  formatEventsBudgetLine,
  formatMuasOfferedLine,
  getLeadStatusLabel,
} from "@/lib/lead-status";
import { BUDGET_TIER_LABELS, MUA_PUSH_STAGE_LABELS, URGENCY_LABELS } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";
import { cn } from "@/lib/utils";
import { fromDbUrgencyBand, fromDbTier, toDbPushStage } from "@/lib/db-mappers";
import { notifyLeadRemovedFromQueue } from "@/lib/queue-events";
import { useToast } from "@/components/ui/Toast";

const VIEW_STORAGE_KEY_RM = "olready_rm_view";
const VIEW_STORAGE_KEY_COMMISSION = "olready_commission_view";
const PER_LEAD_CAP = 3;
const ASSIGNMENT_WINDOW_DAYS = 45;
const PAGE_SIZE = 200;

const TIERS: BudgetTier[] = ["tier1", "tier2", "tier3", "tier4"];
const BANDS: UrgencyBand[] = ["critical", "hot", "active", "longShelf"];
const STAGES: MuaPushStage[] = [
  "initialContact",
  "offerSent",
  "followUpDone",
  "negotiating",
  "brideSelected",
];

const BAND_ORDER: Record<UrgencyBand, number> = {
  critical: 4,
  hot: 3,
  active: 2,
  longShelf: 1,
};

const DOT_COLOR: Record<UrgencyBand, string> = {
  critical: "bg-red-500",
  hot: "bg-orange-500",
  active: "bg-yellow-400",
  longShelf: "bg-slate-400",
};

const BORDER_COLOR: Record<UrgencyBand, string> = {
  critical: "border-l-red-500",
  hot: "border-l-orange-500",
  active: "border-l-yellow-400",
  longShelf: "border-l-slate-400",
};

const GROUP_HEADER: Record<
  UrgencyBand,
  { emoji: string; label: string; className: string }
> = {
  critical: {
    emoji: "🔴",
    label: "CRITICAL",
    className: "bg-red-600 text-white",
  },
  hot: {
    emoji: "🟠",
    label: "HOT",
    className: "bg-orange-500 text-white",
  },
  active: {
    emoji: "🟡",
    label: "ACTIVE",
    className: "bg-yellow-500 text-brand",
  },
  longShelf: {
    emoji: "⬜",
    label: "LONG SHELF",
    className: "bg-slate-500 text-white",
  },
};

const COLUMN_TOP: Record<UrgencyBand, string> = {
  critical: "border-t-red-500",
  hot: "border-t-orange-500",
  active: "border-t-yellow-400",
  longShelf: "border-t-slate-400",
};

type ViewMode = "list" | "kanban" | "health";
type SortKey = "eventDate" | "days" | "window" | "lastTouch";
type SortDir = "asc" | "desc";

interface RmQueueClientProps {
  userRole?: UserRole;
  /** RM assigned queue vs commission RM queue */
  queueVariant?: "rm" | "commission";
  /** Lead profile path prefix (commission uses /rm/leads via middleware) */
  leadBasePath?: string;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatEventDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function formatBudget(amount: number | null): string {
  if (amount == null) return "—";
  return `Rs. ${amount.toLocaleString("en-IN")}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isStaleTouch(lead: LeadFull): boolean {
  if (!lead.lastActivityAt) return true;
  const hours =
    (Date.now() - new Date(lead.lastActivityAt).getTime()) / 3600000;
  return (
    hours > 48 &&
    (lead.urgencyBand === "critical" || lead.urgencyBand === "hot")
  );
}

function assignmentDay(lead: LeadFull): number {
  if (lead.daysSinceAssignment != null) return lead.daysSinceAssignment;
  if (lead.assignmentDaysRemaining != null) {
    return ASSIGNMENT_WINDOW_DAYS - lead.assignmentDaysRemaining;
  }
  return 0;
}

function windowFillClass(day: number): string {
  if (day >= 40) return "bg-red-500";
  if (day >= 30) return "bg-amber-500";
  return "bg-brand";
}

function sortLeads(
  leads: LeadFull[],
  sortKey: SortKey | null,
  sortDir: SortDir
): LeadFull[] {
  const dir = sortDir === "asc" ? 1 : -1;

  const cmp = (a: LeadFull, b: LeadFull): number => {
    if (!sortKey) {
      const bandDiff = BAND_ORDER[b.urgencyBand] - BAND_ORDER[a.urgencyBand];
      if (bandDiff !== 0) return bandDiff;
      return a.daysToEvent - b.daysToEvent;
    }

    let diff = 0;
    switch (sortKey) {
      case "eventDate":
        diff =
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
        break;
      case "days":
        diff = a.daysToEvent - b.daysToEvent;
        break;
      case "window": {
        const aw = a.assignmentDaysRemaining ?? 999;
        const bw = b.assignmentDaysRemaining ?? 999;
        diff = aw - bw;
        break;
      }
      case "lastTouch": {
        const at = a.lastActivityAt
          ? new Date(a.lastActivityAt).getTime()
          : 0;
        const bt = b.lastActivityAt
          ? new Date(b.lastActivityAt).getTime()
          : 0;
        diff = at - bt;
        break;
      }
    }
    return diff * dir;
  };

  return [...leads].sort(cmp);
}

function matchesSearch(lead: LeadFull, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    lead.brideName.toLowerCase().includes(lower) ||
    lead.displayId.toLowerCase().includes(lower)
  );
}

function WindowBar({
  lead,
  widthClass = "w-8",
  heightClass = "h-1.5",
  fullWidth = false,
}: {
  lead: LeadFull;
  widthClass?: string;
  heightClass?: string;
  fullWidth?: boolean;
}) {
  const day = assignmentDay(lead);
  const pct = Math.min(100, (day / ASSIGNMENT_WINDOW_DAYS) * 100);
  const remaining = lead.assignmentDaysRemaining;

  return (
    <div
      className={cn("group/bar relative", fullWidth ? "w-full" : widthClass)}
      title={
        remaining != null
          ? `${remaining} days remaining before Commission RM shift`
          : "Assignment window"
      }
    >
      <div
        className={cn(
          "overflow-hidden rounded-full bg-slate-200",
          heightClass,
          fullWidth ? "w-full" : widthClass
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all", windowFillClass(day))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KanbanCard({
  lead,
  isCommission = false,
  leadBasePath = "/rm/leads",
}: {
  lead: LeadFull;
  isCommission?: boolean;
  leadBasePath?: string;
}) {
  const day = assignmentDay(lead);
  const shiftSoon =
    !isCommission &&
    lead.assignmentDaysRemaining !== null &&
    lead.assignmentDaysRemaining <= 5;

  const daysClass =
    lead.urgencyBand === "critical"
      ? "text-red-600 font-semibold"
      : lead.urgencyBand === "hot"
        ? "text-orange-600 font-medium"
        : "text-slate-muted";

  return (
    <Link
      href={`${leadBasePath}/${lead.id}`}
      className={cn(
        "block rounded-lg border border-slate-200 bg-white shadow-sm border-l-[3px] p-3",
        "transition-all hover:shadow-md hover:border-accent/40",
        BORDER_COLOR[lead.urgencyBand]
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-brand">
          {lead.brideName}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-slate-muted">
          {lead.displayId}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-muted">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>{lead.city}</span>
          {lead.region ? (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {formatLeadRegion(lead.region)}
            </span>
          ) : null}
        </span>
        <span className={cn(" · ", daysClass)}>{lead.daysToEvent}d to event</span>
      </p>
      {!isCommission ? (
        <div className="mt-2 flex items-center gap-2">
          <WindowBar lead={lead} fullWidth heightClass="h-1" />
          <span className="shrink-0 text-[10px] text-slate-muted">Day {day}</span>
        </div>
      ) : lead.handoverReason ? (
        <p className="mt-2 text-[10px] text-slate-muted line-clamp-2">
          {lead.handoverReason}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-muted">
          {formatBudget(lead.budgetAmount)}
        </span>
        <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-800 line-clamp-2 max-w-full">
          {formatEventsBudgetLine(lead)}
        </span>
        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand line-clamp-2">
          {formatMuasOfferedLine(lead)}
        </span>
      </div>
      {shiftSoon && lead.assignmentDaysRemaining !== null && (
        <p className="mt-2 -mx-3 -mb-3 rounded-b-lg bg-amber-100 px-3 py-1.5 text-center text-[10px] font-medium text-amber-900">
          ⚠ Shifts in {lead.assignmentDaysRemaining}d
        </p>
      )}
    </Link>
  );
}

export function RmQueueClient({
  userRole = "regionalRm",
  queueVariant = "rm",
  leadBasePath = "/rm/leads",
}: RmQueueClientProps) {
  const isCommission = queueVariant === "commission";
  const viewStorageKey = isCommission
    ? VIEW_STORAGE_KEY_COMMISSION
    : VIEW_STORAGE_KEY_RM;
  const queueStatus = isCommission ? "commission_rm" : "assigned";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [selectedTiers, setSelectedTiers] = useState<Set<BudgetTier>>(new Set());
  const [selectedBand, setSelectedBand] = useState<UrgencyBand | null>(null);
  const [selectedStage, setSelectedStage] = useState<MuaPushStage | null>(null);
  const [portalFilter, setPortalFilter] = useState<"" | "on" | "off">("");
  const [stagesExpanded, setStagesExpanded] = useState(false);
  const [leads, setLeads] = useState<LeadFull[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<UrgencyBand>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [healthLeads, setHealthLeads] = useState<PipelineHealthLead[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeFilterValue>(() =>
    valueFromSearchParams(
      searchParams.get("eventFrom"),
      searchParams.get("eventTo")
    )
  );

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(viewStorageKey);
    if (stored === "list" || stored === "kanban" || stored === "health")
      setView(stored);
  }, [viewStorageKey]);

  useEffect(() => {
    const onRemoved = (e: Event) => {
      const leadId = (e as CustomEvent<{ leadId: string }>).detail?.leadId;
      if (!leadId) return;
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      setTotal((t) => Math.max(0, t - 1));
    };
    window.addEventListener("lead-removed-from-queue", onRemoved);
    return () => window.removeEventListener("lead-removed-from-queue", onRemoved);
  }, []);

  function setViewMode(mode: ViewMode) {
    setView(mode);
    localStorage.setItem(viewStorageKey, mode);
  }

  function applyDateRange(value: DateRangeFilterValue) {
    setDateRange(value);
    const params = new URLSearchParams(window.location.search);
    const { eventFrom, eventTo } = toSearchParams(value);
    if (eventFrom) params.set("eventFrom", eventFrom);
    else params.delete("eventFrom");
    if (eventTo) params.set("eventTo", eventTo);
    else params.delete("eventTo");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const params = new URLSearchParams({
        status: queueStatus,
        page: String(pageNum),
        pageSize: String(PAGE_SIZE),
      });
      const { eventFrom, eventTo } = toSearchParams(dateRange);
      if (eventFrom) params.set("eventFrom", eventFrom);
      if (eventTo) params.set("eventTo", eventTo);
      if (portalFilter) params.set("portal", portalFilter);

      let res: Response;
      try {
        res = await fetch(`/api/leads/queue?${params}`, { credentials: "include" });
      } catch {
        const msg =
          "Could not reach the server. Stop extra dev servers, run: rm -rf .next && npm run dev";
        setFetchError(msg);
        if (!append) {
          setLeads([]);
          setTotal(0);
          setHasMore(false);
        }
        toast(msg, "error");
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      let json: { data: PaginatedResult<LeadFull> | null; error: string | null };
      try {
        json = (await res.json()) as {
          data: PaginatedResult<LeadFull> | null;
          error: string | null;
        };
      } catch {
        const msg = `Invalid response from server (${res.status})`;
        setFetchError(msg);
        if (!append) {
          setLeads([]);
          setTotal(0);
          setHasMore(false);
        }
        toast(msg, "error");
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (!res.ok || json.error) {
        const msg = json.error ?? `Could not load leads (${res.status})`;
        setFetchError(msg);
        if (!append) {
          setLeads([]);
          setTotal(0);
          setHasMore(false);
        }
        toast(msg, "error");
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      setFetchError(null);

      const payload = json.data;
      if (payload) {
        setLeads((prev) =>
          append ? [...prev, ...payload.data] : payload.data
        );
        setTotal(payload.total);
        setHasMore(payload.page < payload.totalPages);
        setPage(payload.page);
      } else if (!append) {
        setLeads([]);
        setTotal(0);
        setHasMore(false);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [dateRange, portalFilter, toast, queueStatus]
  );

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const params = new URLSearchParams();
      for (const t of selectedTiers) params.append("tier", t);
      const { eventFrom, eventTo } = toSearchParams(dateRange);
      if (eventFrom) params.set("eventFrom", eventFrom);
      if (eventTo) params.set("eventTo", eventTo);
      const res = await fetch(`/api/leads/pipeline-health?${params}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        data: PipelineHealthLead[] | null;
        error: string | null;
      };
      if (!res.ok || json.error) {
        const msg = json.error ?? `Pipeline health failed (${res.status})`;
        console.error("pipeline-health:", msg);
        toast(msg, "error");
        setHealthLeads([]);
      } else {
        setHealthLeads(json.data ?? []);
      }
    } catch {
      toast("Could not load pipeline health", "error");
      setHealthLeads([]);
    } finally {
      setHealthLoading(false);
    }
  }, [selectedTiers, dateRange, toast]);

  useEffect(() => {
    setLeads([]);
    setPage(1);
    void fetchPage(1, false);
  }, [portalFilter, fetchPage]);

  useEffect(() => {
    if (view === "health") void fetchHealth();
  }, [view, fetchHealth]);

  const loadNextPage = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchPage(page + 1, true);
  }, [loading, loadingMore, hasMore, page, fetchPage]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextPage();
      },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadNextPage, view, leads.length]);

  useEffect(() => {
    if (view !== "kanban") return;
    const handlers: (() => void)[] = [];
    columnRefs.current.forEach((col) => {
      if (!col) return;
      const onScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = col;
        if (scrollHeight - scrollTop - clientHeight < 80) loadNextPage();
      };
      col.addEventListener("scroll", onScroll, { passive: true });
      handlers.push(() => col.removeEventListener("scroll", onScroll));
    });
    return () => handlers.forEach((h) => h());
  }, [view, loadNextPage, leads.length]);

  const filteredBase = useMemo(() => {
    let list = leads;
    if (debouncedSearch) {
      list = list.filter((l) => matchesSearch(l, debouncedSearch));
    }
    if (selectedTiers.size > 0) {
      list = list.filter((l) =>
        selectedTiers.has(fromDbTier(String(l.budgetTier)) as BudgetTier)
      );
    }
    if (selectedStage) {
      const dbStage = toDbPushStage(selectedStage);
      list = list.filter((l) =>
        (l.activePushStages ?? []).includes(dbStage)
      );
    }
    return list;
  }, [
    leads,
    debouncedSearch,
    selectedTiers,
    selectedStage,
  ]);

  const filtered = useMemo(() => {
    let list = filteredBase;
    if (selectedBand) {
      list = list.filter(
        (l) => fromDbUrgencyBand(String(l.urgencyBand)) === selectedBand
      );
    }
    return sortLeads(list, sortKey, sortDir);
  }, [filteredBase, selectedBand, sortKey, sortDir]);

  const summary = useMemo(() => {
    const counts: Record<UrgencyBand, number> = {
      critical: 0,
      hot: 0,
      active: 0,
      longShelf: 0,
    };
    let approaching = 0;
    for (const l of filteredBase) {
      counts[fromDbUrgencyBand(String(l.urgencyBand))]++;
      if (
        l.assignmentDaysRemaining !== null &&
        l.assignmentDaysRemaining <= 5
      ) {
        approaching++;
      }
    }
    return { counts, approaching, total: filteredBase.length };
  }, [filteredBase]);

  const grouped = useMemo(() => {
    const map: Record<UrgencyBand, LeadFull[]> = {
      critical: [],
      hot: [],
      active: [],
      longShelf: [],
    };
    for (const l of filtered) {
      const band = fromDbUrgencyBand(String(l.urgencyBand));
      map[band].push(l);
    }
    return map;
  }, [filtered]);

  const visibleLeadIds = useMemo(
    () => filtered.map((l) => l.id),
    [filtered]
  );

  const allVisibleSelected =
    visibleLeadIds.length > 0 &&
    visibleLeadIds.every((id) => selectedIds.has(id));

  function toggleLeadSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtersActive =
    search.length > 0 ||
    selectedTiers.size > 0 ||
    selectedBand != null ||
    selectedStage != null ||
    portalFilter !== "";

  function toggleTier(t: BudgetTier) {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function selectBand(b: UrgencyBand) {
    setSelectedBand((prev) => (prev === b ? null : b));
  }

  function selectStage(s: MuaPushStage) {
    setSelectedStage((prev) => (prev === s ? null : s));
  }

  function clearFilters() {
    setSearch("");
    setSelectedTiers(new Set());
    setSelectedBand(null);
    setSelectedStage(null);
    setPortalFilter("");
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleCollapse(band: UrgencyBand) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }

  function SortIndicator({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );
  }

  function navigateToLead(id: string) {
    router.push(`${leadBasePath}/${id}`);
  }

  const showBulkReassign =
    userRole === "admin" || userRole === "owner";

  return (
    <div className={cn("space-y-0", selectedIds.size > 0 && "pb-24")}>
      {!isCommission && <MyMonthCard />}
      {/* View toggle */}
      <div className="mb-4 flex justify-end gap-1">
        <button
          type="button"
          title="List view"
          onClick={() => setViewMode("list")}
          className={cn(
            "rounded-lg p-2 transition-colors",
            view === "list"
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-muted hover:bg-slate-200"
          )}
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Kanban view"
          onClick={() => setViewMode("kanban")}
          className={cn(
            "rounded-lg p-2 transition-colors",
            view === "kanban"
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-muted hover:bg-slate-200"
          )}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Pipeline health"
          onClick={() => setViewMode("health")}
          className={cn(
            "rounded-lg p-2 transition-colors",
            view === "health"
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-muted hover:bg-slate-200"
          )}
        >
          <Activity className="h-4 w-4" />
        </button>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {fetchError}. Log out and back in, or restart the dev server if the database
          pool is exhausted.
        </div>
      )}

      {/* Summary strip — click a band to filter; sticky below tabs */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-slate-200 bg-white/95 px-1 py-2.5 text-xs backdrop-blur supports-[backdrop-filter]:bg-white/80">
        {BANDS.map((b) => {
          const active = selectedBand === b;
          const count = summary.counts[b];
          const colorClass =
            b === "critical"
              ? "text-red-600"
              : b === "hot"
                ? "text-orange-600"
                : b === "active"
                  ? "text-yellow-700"
                  : "text-slate-500";
          return (
            <button
              key={b}
              type="button"
              onClick={() => selectBand(b)}
              title={`Filter ${URGENCY_LABELS[b]} leads`}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors",
                colorClass,
                active
                  ? "bg-slate-100 ring-1 ring-slate-300"
                  : "hover:bg-slate-50"
              )}
            >
              {GROUP_HEADER[b].emoji} {count} {URGENCY_LABELS[b]}
            </button>
          );
        })}
        {!isCommission && (
          <>
            <span className="text-slate-300">|</span>
            <span className="text-amber-700">
              ⚠ {summary.approaching} approaching shift
            </span>
            <span className="text-slate-300">·</span>
          </>
        )}
        <span className="text-slate-muted">{summary.total} assigned leads</span>
        {selectedBand && (
          <button
            type="button"
            onClick={() => setSelectedBand(null)}
            className="ml-1 inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-200"
          >
            Clear urgency
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search bride or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Event
          </span>
          <DateRangeFilter value={dateRange} onChange={applyDateRange} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Tier
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTier(t)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedTiers.has(t)
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-white text-slate-muted hover:border-slate-300"
                )}
              >
                {BUDGET_TIER_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Portal
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["", "on", "off"] as const).map((p) => (
              <button
                key={p || "all"}
                type="button"
                onClick={() => setPortalFilter(p)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  portalFilter === p
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-white text-slate-muted hover:border-slate-300"
                )}
              >
                {p === "" ? "All" : p === "on" ? "On portal" : "Not on portal"}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200/80 pt-2">
          <button
            type="button"
            onClick={() => setStagesExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-brand"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Pipeline stage
            {selectedStage && (
              <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                1 active
              </span>
            )}
            {stagesExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {stagesExpanded && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectStage(s)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedStage === s
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-slate-200 bg-white text-slate-muted hover:border-slate-300"
                  )}
                >
                  {MUA_PUSH_STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {filtersActive && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-2">
            <span className="text-[11px] font-medium text-slate-400">Active:</span>
            {search && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200">
                “{search.length > 20 ? `${search.slice(0, 20)}…` : search}”
                <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                  <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                </button>
              </span>
            )}
            {[...selectedTiers].map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200"
              >
                {BUDGET_TIER_LABELS[t]}
                <button type="button" onClick={() => toggleTier(t)} aria-label={`Remove ${BUDGET_TIER_LABELS[t]}`}>
                  <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                </button>
              </span>
            ))}
            {selectedBand && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200">
                {URGENCY_LABELS[selectedBand]}
                <button type="button" onClick={() => setSelectedBand(null)} aria-label="Clear urgency">
                  <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                </button>
              </span>
            )}
            {selectedStage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200">
                {MUA_PUSH_STAGE_LABELS[selectedStage]}
                <button type="button" onClick={() => setSelectedStage(null)} aria-label="Clear stage">
                  <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                </button>
              </span>
            )}
            {portalFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200">
                {portalFilter === "on" ? "On portal" : "Not on portal"}
                <button type="button" onClick={() => setPortalFilter("")} aria-label="Clear portal filter">
                  <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-muted">
        Showing {filtered.length} of {total} leads
        {leads.length < total && hasMore ? " (scroll for more)" : ""}
      </p>

      {/* Content */}
      {loading ? (
        <div className="mt-6 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded bg-slate-100"
            />
          ))}
        </div>
      ) : view === "list" ? (
        <ListView
          grouped={grouped}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          handleSort={handleSort}
          SortIndicator={SortIndicator}
          navigateToLead={navigateToLead}
          selectedIds={selectedIds}
          allVisibleSelected={allVisibleSelected}
          onToggleLead={toggleLeadSelect}
          onToggleAllVisible={() => {
            if (allVisibleSelected) setSelectedIds(new Set());
            else setSelectedIds(new Set(visibleLeadIds));
          }}
          isCommission={isCommission}
        />
      ) : view === "kanban" ? (
        <KanbanView
          grouped={grouped}
          columnRefs={columnRefs}
          isCommission={isCommission}
          leadBasePath={leadBasePath}
        />
      ) : (
        <PipelineHealthKanban
          leads={healthLeads.filter((l) => {
            if (debouncedSearch && !matchesSearch(l, debouncedSearch)) return false;
            if (selectedTiers.size > 0 && !selectedTiers.has(l.budgetTier as BudgetTier))
              return false;
            if (selectedBand && l.urgencyBand !== selectedBand) return false;
            return true;
          })}
          loading={healthLoading}
        />
      )}

      <div ref={loadMoreRef} className="flex justify-center py-4">
        {loadingMore && (
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
        )}
      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={[...selectedIds]}
          leads={leads}
          showReassign={showBulkReassign}
          onClearSelection={() => setSelectedIds(new Set())}
          onDone={() => {
            setSelectedIds(new Set());
            setLeads([]);
            setPage(1);
            void fetchPage(1, false);
          }}
        />
      )}
    </div>
  );
}

function ListView({
  grouped,
  collapsed,
  toggleCollapse,
  handleSort,
  SortIndicator,
  navigateToLead,
  selectedIds,
  allVisibleSelected,
  onToggleLead,
  onToggleAllVisible,
  isCommission = false,
}: {
  grouped: Record<UrgencyBand, LeadFull[]>;
  collapsed: Set<UrgencyBand>;
  toggleCollapse: (b: UrgencyBand) => void;
  handleSort: (k: SortKey) => void;
  SortIndicator: React.FC<{ column: SortKey }>;
  navigateToLead: (id: string) => void;
  selectedIds: Set<string>;
  allVisibleSelected: boolean;
  onToggleLead: (id: string) => void;
  onToggleAllVisible: () => void;
  isCommission?: boolean;
}) {
  let rowIndex = 0;
  const colCount = isCommission ? 13 : 14;

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[1080px] border-collapse text-left">
        <thead className="sticky top-[41px] z-10 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-muted">
          <tr>
            <th className="w-8 px-2 py-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleAllVisible}
                aria-label="Select all visible leads"
              />
            </th>
            <th className="w-6 px-2 py-2" />
            <th className="px-2 py-2">Bride</th>
            <th className="px-2 py-2">ID</th>
            <th className="px-2 py-2">City</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Budget</th>
            <th className="px-2 py-2">Events</th>
            <th className="cursor-pointer px-2 py-2 hover:text-brand" onClick={() => handleSort("eventDate")}>
              Event date <SortIndicator column="eventDate" />
            </th>
            {!isCommission && (
              <th className="cursor-pointer px-2 py-2 hover:text-brand" onClick={() => handleSort("window")}>
                Window <SortIndicator column="window" />
              </th>
            )}
            <th className="px-2 py-2">MUAs offered</th>
            <th className="cursor-pointer px-2 py-2 hover:text-brand" onClick={() => handleSort("lastTouch")}>
              Last touch <SortIndicator column="lastTouch" />
            </th>
            <th className="px-2 py-2">Contact</th>
            <th className="w-8 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {BANDS.map((band) => {
            const bandLeads = grouped[band];
            if (bandLeads.length === 0) return null;
            const header = GROUP_HEADER[band];
            const isCollapsed = collapsed.has(band);

            return (
              <Fragment key={band}>
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(band)}
                      className={cn(
                        "flex h-8 w-full items-center gap-2 px-3 text-xs font-semibold",
                        header.className
                      )}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {header.emoji} {header.label} · {bandLeads.length} leads
                    </button>
                  </td>
                </tr>
                {!isCollapsed &&
                  bandLeads.map((lead) => {
                    const alt = rowIndex % 2 === 1;
                    rowIndex++;
                    const day = assignmentDay(lead);
                    const eventDateClass =
                      lead.daysToEvent <= 30
                        ? "font-bold text-red-600"
                        : lead.daysToEvent <= 45
                          ? "font-semibold text-amber-600"
                          : "text-sm";
                    const atCap = lead.activePushesCount >= PER_LEAD_CAP;
                    const stale = isStaleTouch(lead);

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => navigateToLead(lead.id)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 text-sm transition-colors hover:bg-brand/5",
                          alt ? "bg-slate-50" : "bg-white"
                        )}
                      >
                        <td
                          className="w-8 px-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => onToggleLead(lead.id)}
                            aria-label={`Select ${lead.brideName}`}
                          />
                        </td>
                        <td className="w-6 px-2 text-center">
                          <span
                            className={cn(
                              "inline-block h-2.5 w-2.5 rounded-full",
                              DOT_COLOR[lead.urgencyBand]
                            )}
                          />
                        </td>
                        <td className="max-w-[160px] truncate px-2 font-medium text-brand">
                          {lead.brideName}
                        </td>
                        <td className="px-2 font-mono text-xs text-slate-muted">
                          {lead.displayId}
                        </td>
                        <td className="px-2 text-slate-muted">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{lead.city}</span>
                            {lead.region ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {formatLeadRegion(lead.region)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-xs text-slate-muted whitespace-nowrap align-top">
                          {getLeadStatusLabel(lead)}
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <p className="whitespace-nowrap font-medium text-brand">
                            {formatBudget(lead.budgetAmount)}
                          </p>
                          <p className="text-[11px] text-slate-muted">
                            {BUDGET_TIER_LABELS[lead.budgetTier]}
                          </p>
                        </td>
                        <td className="max-w-[200px] px-2 py-2.5 align-top text-xs leading-snug text-slate-muted">
                          <span className="line-clamp-2">{formatEventsBudgetLine(lead)}</span>
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2.5 whitespace-nowrap align-top",
                            eventDateClass
                          )}
                        >
                          {formatEventDateShort(lead.eventDate)}
                          <span className="block text-xs text-slate-muted">
                            {lead.daysToEvent}d to event
                          </span>
                        </td>
                        {!isCommission && (
                          <td className="px-2 py-2.5 align-top">
                            <div className="flex items-center gap-1.5">
                              <WindowBar lead={lead} />
                              <span className="text-[10px] text-slate-muted whitespace-nowrap">
                                {day}/45
                              </span>
                            </div>
                          </td>
                        )}
                        <td className="max-w-[180px] px-2 py-2.5 align-top">
                          <p
                            className={cn(
                              "text-xs font-medium leading-snug",
                              atCap ? "text-red-600" : "text-brand"
                            )}
                          >
                            <span className="line-clamp-3">{formatMuasOfferedLine(lead)}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-muted">
                            {lead.muasOfferedCount ?? 0} offered · {lead.activePushesCount}{" "}
                            active
                          </p>
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2.5 text-xs align-top",
                            stale ? "font-semibold text-red-600" : "text-slate-muted"
                          )}
                        >
                          {formatRelative(lead.lastActivityAt)}
                        </td>
                        <td className="px-2 py-2.5 align-top whitespace-nowrap">
                          <LeadQuickContact
                            leadId={lead.id}
                            brideName={lead.brideName}
                            phone={lead.phone}
                            city={lead.city}
                            variant="compact"
                          />
                        </td>
                        <td className="px-2 text-slate-muted">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </tr>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {Object.values(grouped).every((g) => g.length === 0) && (
        <p className="py-12 text-center text-sm text-slate-muted">
          No leads match your filters
        </p>
      )}
    </div>
  );
}

function KanbanView({
  grouped,
  columnRefs,
  isCommission = false,
  leadBasePath = "/rm/leads",
}: {
  grouped: Record<UrgencyBand, LeadFull[]>;
  columnRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  isCommission?: boolean;
  leadBasePath?: string;
}) {
  return (
    <div className="mt-3 flex gap-4 overflow-x-auto pb-4">
      {BANDS.map((band, colIdx) => {
        const bandLeads = grouped[band];
        const shifting = bandLeads.filter(
          (l) =>
            l.assignmentDaysRemaining !== null &&
            l.assignmentDaysRemaining <= 5
        ).length;

        return (
          <div
            key={band}
            className={cn(
              "flex min-w-[280px] max-w-[320px] flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50/50 border-t-4",
              COLUMN_TOP[band]
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
              <h3 className="text-sm font-semibold text-text">
                {URGENCY_LABELS[band]}{" "}
                <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-muted">
                  {bandLeads.length}
                </span>
              </h3>
              {!isCommission && shifting > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  ⚠ {shifting} shifting soon
                </span>
              )}
            </div>
            <div
              ref={(el) => {
                columnRefs.current[colIdx] = el;
              }}
              className="flex flex-col gap-2 overflow-y-auto p-2"
              style={{ maxHeight: "calc(100vh - 220px)" }}
            >
              {bandLeads.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-muted">
                  No {URGENCY_LABELS[band]} leads
                </div>
              ) : (
                bandLeads.map((lead) => (
                  <KanbanCard key={lead.id} lead={lead} isCommission={isCommission} leadBasePath={leadBasePath} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
