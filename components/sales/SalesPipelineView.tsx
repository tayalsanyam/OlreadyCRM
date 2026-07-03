"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { PIPELINE_STAGE_ORDER, type PipelineStage, type Task } from "@/lib/types";
import { getManualStageChangeOptions } from "@/lib/sales-stage-transitions";
import type { SalesPipelineMuaType } from "@/lib/sales-pipeline-labels";
import { MuaPipelineProfile } from "@/components/sales/MuaPipelineProfile";
import { PipelineQuickContact } from "@/components/sales/PipelineQuickContact";
import { TodaysFocusTray } from "@/components/sales/TodaysFocusTray";
import {
  SalesTaskCompleteModal,
  type TaskCompletePayload,
} from "@/components/sales/SalesTaskCompleteModal";
import { StageChangePanel, type StageChangeResult } from "@/components/sales/StageChangePanel";
import { useToast } from "@/components/ui/Toast";
import { buildTodaysFocusItems, mergeTodaysFocusItems, type TodaysFocusItem } from "@/lib/sales-todays-focus";
import {
  findPendingSalesTaskForPipeline,
  isPendingSalesPipelineTask,
  taskPipelineId,
} from "@/lib/sales-task-pipeline";

type Row = {
  id: string;
  muaName: string;
  muaCity: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  muaSource?: string | null;
  muaType: string;
  stage: PipelineStage;
  daysInStage: number;
  daysSinceLastContact: number | null;
  teamId: string | null;
  teamName?: string | null;
  updatedAt: string;
  assignedToName: string | null;
  priceOffered?: number | null;
  priorityTag?: "hot" | "follow_up" | "nurturing" | "cold" | null;
  lastCalledAt?: string | null;
  lastCallOutcome?: string | null;
  callAttemptsThisWeek?: number;
  totalRepeatedNoAnswer?: number;
  salesNotes?: string | null;
  lastNotePreview?: string | null;
  demoScheduledAt?: string | null;
  confirmScheduledAt?: string | null;
  dealCloseScheduledAt?: string | null;
};

type RiskTag =
  | "needsCallToday"
  | "atRiskOfGoingCold"
  | "longOverdueReachNow"
  | "stuckAtDetailsShared";

const RISK_FILTERS: Array<{ id: "all" | RiskTag; label: string }> = [
  { id: "all", label: "All" },
  { id: "needsCallToday", label: "Needs a call today" },
  { id: "atRiskOfGoingCold", label: "At risk of going cold" },
  { id: "longOverdueReachNow", label: "Long overdue — reach now" },
  { id: "stuckAtDetailsShared", label: "Stuck at Details Shared" },
];

const RISK_TAG_LABELS: Record<RiskTag, string> = {
  needsCallToday: "Needs call",
  atRiskOfGoingCold: "Going cold",
  longOverdueReachNow: "Overdue",
  stuckAtDetailsShared: "Stuck",
};

type CallStatusFilter = "all" | "neverCalled" | "connectedRecently" | "repeatedNoAnswer" | "calledNoRecentContact";

const PRIORITY_FILTERS: Array<{ id: "all" | NonNullable<Row["priorityTag"] | "untagged">; label: string }> = [
  { id: "all", label: "All" },
  { id: "hot", label: "🔥 Hot" },
  { id: "follow_up", label: "📞 Follow-up" },
  { id: "nurturing", label: "💬 Nurturing" },
  { id: "cold", label: "❄️ Cold" },
  { id: "untagged", label: "Untagged" },
];

const CALL_STATUS_FILTERS: Array<{ id: CallStatusFilter; label: string }> = [
  { id: "all", label: "All calls" },
  { id: "neverCalled", label: "Never called" },
  { id: "connectedRecently", label: "Connected recently" },
  { id: "repeatedNoAnswer", label: "Repeated no answer" },
  { id: "calledNoRecentContact", label: "No recent contact" },
];

const RM_QUICK_FILTERS: Array<
  | { kind: "priority"; id: (typeof PRIORITY_FILTERS)[number]["id"] }
  | { kind: "call"; id: CallStatusFilter }
  | { kind: "risk"; id: RiskTag }
> = [
  { kind: "priority", id: "hot" },
  { kind: "call", id: "neverCalled" },
  { kind: "call", id: "repeatedNoAnswer" },
  { kind: "risk", id: "needsCallToday" },
];

function isPersonalPipelineRole(role: string) {
  return role === "salesRm" || role === "salesTl";
}

function isAdminPipelineRole(role: string) {
  return role === "admin" || role === "owner";
}

function canBulkPipelineOps(role: string) {
  return role === "salesTl" || isAdminPipelineRole(role);
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-brand bg-brand text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

const PRIORITY_ORDER: Record<string, number> = {
  hot: 0,
  follow_up: 1,
  nurturing: 2,
  cold: 3,
  null: 4,
};

const PRIORITY_LABEL: Record<NonNullable<Row["priorityTag"]>, string> = {
  hot: "🔥 Hot",
  follow_up: "📞 Follow-up",
  nurturing: "💬 Nurturing",
  cold: "❄️ Cold",
};

function parseAiSections(text: string): Array<{ title: string; body: string[] }> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    if (/^\d+\)\s+/.test(line) || /^#+\s*/.test(line)) {
      if (current) sections.push(current);
      current = { title: line.replace(/^#+\s*/, ""), body: [] };
      continue;
    }
    if (!current) current = { title: "Suggested Action", body: [] };
    current.body.push(line.replace(/^[-*]\s*/, ""));
  }
  if (current) sections.push(current);
  return sections;
}

function rowTags(r: Row): RiskTag[] {
  const tags: RiskTag[] = [];
  const noContactDays = r.daysSinceLastContact ?? 0;
  if (noContactDays >= 3) tags.push("needsCallToday");
  if (noContactDays >= 7) tags.push("longOverdueReachNow");
  if (r.stage === "Details Shared" && (r.daysInStage ?? 0) >= 3) tags.push("stuckAtDetailsShared");
  if ((r.daysInStage ?? 0) >= 5 || noContactDays >= 7) tags.push("atRiskOfGoingCold");
  return tags;
}

function callPill(r: Row): { text: string; tone: "green" | "red" | "gray" } {
  if (!r.lastCalledAt) return { text: "Never", tone: "gray" };
  const days = Math.floor((Date.now() - new Date(r.lastCalledAt).getTime()) / 86400000);
  const out = (r.lastCallOutcome ?? "").toLowerCase();
  if ((r.totalRepeatedNoAnswer ?? 0) >= 3) return { text: `No ans · ${r.totalRepeatedNoAnswer}×`, tone: "red" };
  if (out.includes("connect") || out.includes("answer") || out.includes("interested")) return { text: `${days}d`, tone: "green" };
  return { text: `${days}d`, tone: "gray" };
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function SalesPipelineView() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [segment, setSegment] = useState<SalesPipelineMuaType>("candidate");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [assignment, setAssignment] = useState<"all" | "assigned" | "unassigned">("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortBy, setSortBy] = useState<"updated" | "daysInStage" | "name">("updated");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskTag>("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [contactRiskFilter, setContactRiskFilter] = useState<"all" | "notContacted" | "contacted">("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<(typeof PRIORITY_FILTERS)[number]["id"]>("all");
  const [callStatusFilter, setCallStatusFilter] = useState<CallStatusFilter>("all");
  const [todayTasksOnly, setTodayTasksOnly] = useState(false);
  const [onboardingOnly, setOnboardingOnly] = useState(false);
  const [todaysFocusOnly, setTodaysFocusOnly] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedPipelineInitialTab, setSelectedPipelineInitialTab] = useState<"overview" | "checklists" | undefined>();
  const [todayTasks, setTodayTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [focusTaskPipelineIds, setFocusTaskPipelineIds] = useState<Set<string>>(new Set());
  const [aiFor, setAiFor] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ title: string; text: string; contextMeta?: string } | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkStage, setBulkStage] = useState("");
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([]);
  /** All segments — Today's Focus must not be limited to the active segment tab. */
  const [focusRows, setFocusRows] = useState<Row[]>([]);
  const [salesTasks, setSalesTasks] = useState<Task[]>([]);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [focusReschedule, setFocusReschedule] = useState<TodaysFocusItem | null>(null);
  const [pendingComplete, setPendingComplete] = useState<
    TaskCompletePayload & { taskId: string; pipelineId: string; taskType: string }
  | null>(null);
  const [stagePanelOpen, setStagePanelOpen] = useState(false);
  const [modalPipelineStage, setModalPipelineStage] = useState<PipelineStage | null>(null);
  const [stagePanelCurrentStage, setStagePanelCurrentStage] = useState<PipelineStage | null>(null);
  const [stagePanelLoading, setStagePanelLoading] = useState(false);

  const isPersonalView = isPersonalPipelineRole(userRole);
  const isAdminView = isAdminPipelineRole(userRole);
  const showBulkOps = canBulkPipelineOps(userRole);

  const loadFocusRows = useCallback(async () => {
    if (!isPersonalPipelineRole(userRole)) {
      setFocusRows([]);
      return;
    }
    try {
      const res = await fetch("/api/sales/pipeline", { cache: "no-store" });
      const json = (await readJsonSafe<{ data?: Row[]; error?: string | null }>(res)) ?? {};
      if (!res.ok || json.error) {
        setFocusRows([]);
        return;
      }
      setFocusRows(json.data ?? []);
    } catch {
      setFocusRows([]);
    }
  }, [userRole]);

  const loadSalesTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const json = (await readJsonSafe<{ data?: { data?: Task[] } }>(res)) ?? {};
      const tasks = (json.data?.data ?? []).filter((t) => isPendingSalesPipelineTask(t));
      const todayStr = new Date().toDateString();
      const today = tasks.filter((t) => t.dueDate && new Date(t.dueDate).toDateString() === todayStr).length;
      const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString())).length;
      const focus = new Set<string>();
      for (const t of tasks) {
        if (!t.dueDate) continue;
        const due = new Date(t.dueDate);
        const isToday = due.toDateString() === todayStr;
        const isOverdue = due < new Date(new Date().toDateString());
        if (!isToday && !isOverdue) continue;
        const m = String(t.title ?? "").match(/\[PIPE:([0-9a-f-]{36})\]/i);
        if (m?.[1]) focus.add(m[1]);
      }
      setSalesTasks(tasks);
      setTodayTasks(today);
      setOverdueTasks(overdue);
      setFocusTaskPipelineIds(focus);
    } catch {
      setSalesTasks([]);
      setTodayTasks(0);
      setOverdueTasks(0);
      setFocusTaskPipelineIds(new Set());
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("search", search.trim());
      if (stage) qs.set("stage", stage);
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      qs.set("mua_type", segment);
      if (assigneeFilter && (userRole === "admin" || userRole === "owner")) {
        qs.set("assigned_to", assigneeFilter);
      }
      const res = await fetch(`/api/sales/pipeline?${qs}`, { cache: "no-store" });
      const json = (await readJsonSafe<{ data?: Row[]; error?: string | null }>(res)) ?? {};
      if (!res.ok || json.error) {
        throw new Error(json.error ?? `Sales pipeline API failed (${res.status})`);
      }
      setRows(json.data ?? []);
      if (isPersonalPipelineRole(userRole)) {
        void loadFocusRows();
      }
      void loadSalesTasks();
    } catch (err) {
      setRows([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load sales pipeline");
    } finally {
      setLoading(false);
    }
  }, [search, stage, dateFrom, dateTo, segment, assigneeFilter, userRole, loadFocusRows, loadSalesTasks]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadFocusRows();
  }, [loadFocusRows]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => readJsonSafe<{ data?: { role?: string } }>(r))
      .then((j) => setUserRole(j?.data?.role ?? ""));
  }, []);

  useEffect(() => {
    if (!showBulkOps) return;
    void fetch("/api/sales/reports/scope")
      .then((r) => readJsonSafe<{ data?: { options?: Array<{ value: string; label: string }> } }>(r))
      .then((j) => {
        const opts = (j?.data?.options ?? []).filter(
          (o) => o.value !== "all" && o.value !== "me" && /^[0-9a-f-]{36}$/i.test(o.value),
        );
        setStaffOptions(opts.map((o) => ({ id: o.value, name: o.label })));
      });
  }, [showBulkOps]);

  useEffect(() => {
    void loadSalesTasks();
  }, [loadSalesTasks]);

  useEffect(() => {
    const pipelineId = completeTask?.salesPipelineId ?? null;
    const fromTitle = completeTask?.title?.match(/\[PIPE:([0-9a-f-]{36})\]/i)?.[1] ?? null;
    const id = pipelineId ?? fromTitle;
    if (!id) {
      setModalPipelineStage(null);
      return;
    }
    void fetch(`/api/sales/pipeline/${id}`)
      .then((r) => r.json())
      .then((j: { data?: { pipeline?: { stage?: PipelineStage } } }) => {
        setModalPipelineStage(j.data?.pipeline?.stage ?? completeTask?.salesPipelineStage ?? null);
      })
      .catch(() => setModalPipelineStage(completeTask?.salesPipelineStage ?? null));
  }, [completeTask]);

  const pendingPipelineId = pendingComplete?.pipelineId ?? null;

  useEffect(() => {
    if (!stagePanelOpen || !pendingPipelineId) {
      setStagePanelCurrentStage(null);
      setStagePanelLoading(false);
      return;
    }
    setStagePanelLoading(true);
    void fetch(`/api/sales/pipeline/${pendingPipelineId}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          data?: { pipeline?: { stage?: PipelineStage } };
          error?: string;
        };
        if (!r.ok) throw new Error(j.error ?? "Pipeline not found");
        setStagePanelCurrentStage(j.data?.pipeline?.stage ?? null);
      })
      .catch((e: Error) => {
        setStagePanelCurrentStage(null);
        toast(e.message ?? "Pipeline not found", "error");
        setStagePanelOpen(false);
        setPendingComplete(null);
      })
      .finally(() => setStagePanelLoading(false));
  }, [stagePanelOpen, pendingPipelineId, toast]);

  const refreshAfterFocusAction = useCallback(async () => {
    await Promise.all([load(), loadFocusRows(), loadSalesTasks()]);
  }, [load, loadFocusRows, loadSalesTasks]);

  const todaysFocusItems = useMemo(
    () => mergeTodaysFocusItems(buildTodaysFocusItems(focusRows), salesTasks),
    [focusRows, salesTasks],
  );
  const onboardingPipelineIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of salesTasks) {
      if (t.taskType !== "salesOnboarding") continue;
      const id = taskPipelineId(t);
      if (id) set.add(id);
    }
    return set;
  }, [salesTasks]);
  const todaysFocusPipelineIds = useMemo(
    () => new Set(todaysFocusItems.map((i) => i.pipelineId)),
    [todaysFocusItems],
  );

  const filteredRows = useMemo(() => {
    let next = [...rows];
    if (teamFilter) next = next.filter((r) => r.teamId === teamFilter);
    if (sourceFilter) next = next.filter((r) => (r.muaSource ?? "") === sourceFilter);
    if (assignment === "assigned") next = next.filter((r) => Boolean(r.assignedToName));
    if (assignment === "unassigned") next = next.filter((r) => !r.assignedToName);
    if (contactRiskFilter === "notContacted") next = next.filter((r) => (r.daysSinceLastContact ?? 0) >= 3);
    if (contactRiskFilter === "contacted") next = next.filter((r) => (r.daysSinceLastContact ?? 0) < 3);
      if (riskFilter !== "all") next = next.filter((r) => rowTags(r).includes(riskFilter));
      if (priorityFilter !== "all") {
        next = next.filter((r) => {
          if (priorityFilter === "untagged") return !r.priorityTag;
          return r.priorityTag === priorityFilter;
        });
      }
      if (callStatusFilter !== "all") {
        next = next.filter((r) => {
          const days = r.lastCalledAt ? Math.floor((Date.now() - new Date(r.lastCalledAt).getTime()) / 86400000) : null;
          const out = (r.lastCallOutcome ?? "").toLowerCase();
          if (callStatusFilter === "neverCalled") return !r.lastCalledAt;
          if (callStatusFilter === "connectedRecently") return Boolean(r.lastCalledAt && days !== null && days <= 3 && (out.includes("connect") || out.includes("answer") || out.includes("interest")));
          if (callStatusFilter === "repeatedNoAnswer") return (r.totalRepeatedNoAnswer ?? 0) >= 3;
          if (callStatusFilter === "calledNoRecentContact") return Boolean(r.lastCalledAt && days !== null && days > 5);
          return true;
        });
      }
      if (todayTasksOnly) {
        next = next.filter((r) => focusTaskPipelineIds.has(r.id));
      }
      if (onboardingOnly) {
        next = next.filter((r) => onboardingPipelineIds.has(r.id));
      }
      if (todaysFocusOnly) {
        next = next.filter((r) => todaysFocusPipelineIds.has(r.id));
      }
    if (minPrice.trim()) next = next.filter((r) => Number(r.priceOffered ?? 0) >= Number(minPrice));
    if (maxPrice.trim()) next = next.filter((r) => Number(r.priceOffered ?? 0) <= Number(maxPrice));
    next.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priorityTag ?? "null"] ?? 4;
      const pb = PRIORITY_ORDER[b.priorityTag ?? "null"] ?? 4;
      if (pa !== pb) return pa - pb;
      if (sortBy === "name") return a.muaName.localeCompare(b.muaName);
      if (sortBy === "daysInStage") return b.daysInStage - a.daysInStage;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return next;
  }, [rows, teamFilter, sourceFilter, assignment, contactRiskFilter, riskFilter, minPrice, maxPrice, sortBy, priorityFilter, callStatusFilter, todayTasksOnly, onboardingOnly, onboardingPipelineIds, todaysFocusOnly, focusTaskPipelineIds, todaysFocusPipelineIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const s of PIPELINE_STAGE_ORDER) map.set(s, []);
    for (const row of filteredRows) {
      if (!map.has(row.stage)) map.set(row.stage, []);
      map.get(row.stage)!.push(row);
    }
    return map;
  }, [filteredRows]);

  const teamOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) if (row.teamId) seen.set(row.teamId, row.teamName ?? row.teamId.slice(0, 8));
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) if (row.assignedToName) seen.add(row.assignedToName);
    return Array.from(seen).sort();
  }, [rows]);
  const sourceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) if (row.muaSource) seen.add(row.muaSource);
    return Array.from(seen).sort();
  }, [rows]);

  const totals = useMemo(() => ({
    total: filteredRows.length,
    unassigned: filteredRows.filter((r) => !r.assignedToName).length,
    stale: filteredRows.filter((r) => (r.daysSinceLastContact ?? 0) >= 3).length,
    hot: filteredRows.filter((r) => r.priorityTag === "hot").length,
    pipelineValue: filteredRows
      .filter((r) => PIPELINE_STAGE_ORDER.indexOf(r.stage) >= PIPELINE_STAGE_ORDER.indexOf("Details Shared"))
      .reduce((sum, r) => sum + Number(r.priceOffered ?? 0), 0),
  }), [filteredRows]);

  const advancedFilterCount = useMemo(() => {
    let n = 0;
    if (sourceFilter) n += 1;
    if (contactRiskFilter !== "all") n += 1;
    if (dateFrom || dateTo) n += 1;
    if (minPrice.trim() || maxPrice.trim()) n += 1;
    if (sortBy !== "updated") n += 1;
    if (!isPersonalView && assignment !== "all") n += 1;
    if (isAdminView && (teamFilter || assigneeFilter)) n += 1;
    return n;
  }, [sourceFilter, contactRiskFilter, dateFrom, dateTo, minPrice, maxPrice, sortBy, assignment, isPersonalView, isAdminView, teamFilter, assigneeFilter]);

  const hasActiveClientFilters =
    riskFilter !== "all" ||
    priorityFilter !== "all" ||
    callStatusFilter !== "all" ||
    todayTasksOnly ||
    onboardingOnly ||
    todaysFocusOnly ||
    advancedFilterCount > 0 ||
    Boolean(stage) ||
    Boolean(searchInput.trim());

  function rowFocusHighlight(rowId: string): string {
    const rowItems = todaysFocusItems.filter((i) => i.pipelineId === rowId);
    if (!rowItems.length) return "";
    if (rowItems.some((i) => i.overdue)) return "border-l-4 border-l-red-600 bg-red-50/25";
    const kind = rowItems[0].kind;
    if (kind === "demo") return "border-l-4 border-l-indigo-600 bg-indigo-50/30";
    if (kind === "confirmed") return "border-l-4 border-l-cyan-600 bg-cyan-50/30";
    if (kind === "onboarding") return "border-l-4 border-l-violet-600 bg-violet-50/30";
    return "border-l-4 border-l-emerald-600 bg-emerald-50/30";
  }

  const stageStats = useMemo(() => {
    const map = new Map<PipelineStage, { total: number; unmoved: number; notContacted: number }>();
    for (const s of PIPELINE_STAGE_ORDER) map.set(s, { total: 0, unmoved: 0, notContacted: 0 });
    for (const r of filteredRows) {
      const item = map.get(r.stage);
      if (!item) continue;
      item.total += 1;
      if ((r.daysInStage ?? 0) >= 3) item.unmoved += 1;
      if ((r.daysSinceLastContact ?? 0) >= 3) item.notContacted += 1;
    }
    return map;
  }, [filteredRows]);

  async function aiSuggest(row: Row) {
    setAiFor(row.id);
    const prompt = `Suggest next best sales actions for MUA ${row.muaName} in stage "${row.stage}". Use full ledger/pipeline context. Output sections: 1) Immediate action 2) Call opener 3) WhatsApp draft 4) Escalation trigger 5) Why this action (based on recent comm/context).`;
    try {
      const res = await fetch("/api/sales/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, pipelineId: row.id, history: [] }),
      });
      const json = ((await readJsonSafe<{
        data?: { reply?: string; context?: { recentCommsCount?: number; hasPipelineDetails?: boolean; usedDocs?: string[] } };
        error?: string | null
      }>(res)) ?? {});
      const ctx = json.data?.context;
      const contextMeta = ctx
        ? `Context used: ${ctx.hasPipelineDetails ? "pipeline details" : "basic"} • ${ctx.recentCommsCount ?? 0} comm entries • docs: ${(ctx.usedDocs ?? []).length}`
        : undefined;
      setAiSuggestion({
        title: `${row.muaName} — ${row.stage}`,
        text: json.data?.reply ?? json.error ?? "No suggestion generated.",
        contextMeta,
      });
    } finally {
      setAiFor(null);
    }
  }

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStage("");
    setAssignment("all");
    setSourceFilter("");
    setRiskFilter("all");
    setSortBy("updated");
    setTeamFilter("");
    setAssigneeFilter("");
    setContactRiskFilter("all");
    setMinPrice("");
    setMaxPrice("");
    setDateFrom("");
    setDateTo("");
    setPriorityFilter("all");
    setCallStatusFilter("all");
    setTodayTasksOnly(false);
    setOnboardingOnly(false);
    setTodaysFocusOnly(false);
    setShowAdvancedFilters(false);
  };

  function seniorTaskLocked(taskType: string) {
    return taskType === "salesSeniorCall" && userRole === "salesRm";
  }

  function openOnboardingChecklistsForPipeline(pipelineId: string) {
    setSelectedPipelineId(pipelineId);
    setSelectedPipelineInitialTab("checklists");
  }

  function openOnboardingChecklists(task: Task) {
    const pipelineId =
      task.salesPipelineId ??
      task.title.match(/\[PIPE:([0-9a-f-]{36})\]/i)?.[1] ??
      null;
    if (!pipelineId) {
      toast("Could not link task to pipeline", "error");
      return;
    }
    openOnboardingChecklistsForPipeline(pipelineId);
  }

  function handleOpenFocusItem(item: TodaysFocusItem) {
    if (item.kind === "onboarding" || item.kind === "activationSendBack") {
      openOnboardingChecklistsForPipeline(item.pipelineId);
      return;
    }
    const task = findPendingSalesTaskForPipeline(salesTasks, item.pipelineId);
    if (task) {
      if (seniorTaskLocked(task.taskType)) {
        toast("Senior call tasks are completed by your team lead", "error");
        return;
      }
      setCompleteTask(task);
      return;
    }
    setFocusReschedule(item);
  }

  async function submitTaskComplete(
    taskId: string,
    task: Task,
    payload: TaskCompletePayload & { skipFollowUpSchedule?: boolean },
  ): Promise<boolean> {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "done",
        note: payload.note,
        nextFollowUpDate: payload.nextFollowUpDate ?? null,
        stageChangeTo: payload.stageChangeTo ?? null,
        stageChangeNote: payload.stageChangeNote ?? null,
        skipFollowUpSchedule: payload.skipFollowUpSchedule ?? false,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast(err.error ?? "Could not complete task", "error");
      return false;
    }
    toast("Task completed");
    setCompleteTask(null);
    await refreshAfterFocusAction();
    return true;
  }

  function handleRequireStagePanel(payload: TaskCompletePayload) {
    if (!completeTask) return;
    const pipelineId =
      completeTask.salesPipelineId ??
      completeTask.title.match(/\[PIPE:([0-9a-f-]{36})\]/i)?.[1] ??
      null;
    if (!pipelineId) {
      toast("Could not link task to pipeline", "error");
      return;
    }
    setPendingComplete({ taskId: completeTask.id, pipelineId, taskType: completeTask.taskType, ...payload });
    setStagePanelOpen(true);
    setCompleteTask(null);
  }

  async function handleStagePanelDone(result?: StageChangeResult) {
    if (!pendingComplete) return;
    const pipelineId = pendingComplete.pipelineId;
    const ok = await submitTaskComplete(
      pendingComplete.taskId,
      { id: pendingComplete.taskId, taskType: pendingComplete.taskType } as Task,
      {
        note: pendingComplete.note,
        skipFollowUpSchedule: true,
      },
    );
    setPendingComplete(null);
    setStagePanelOpen(false);
    if (!ok) {
      toast("Stage updated but task completion failed — try again from Tasks", "error");
    }
    if (result?.toStage === "Onboarding" && pipelineId) {
      setSelectedPipelineId(pipelineId);
      setSelectedPipelineInitialTab("checklists");
    }
    void load();
  }

  function toggleRmQuickFilter(
    item: (typeof RM_QUICK_FILTERS)[number],
  ) {
    if (item.kind === "priority") {
      setPriorityFilter((prev) => (prev === item.id ? "all" : item.id));
      setCallStatusFilter("all");
      setRiskFilter("all");
      return;
    }
    if (item.kind === "call") {
      setCallStatusFilter((prev) => (prev === item.id ? "all" : item.id));
      setPriorityFilter("all");
      setRiskFilter("all");
      return;
    }
    setRiskFilter((prev) => (prev === item.id ? "all" : item.id));
    setPriorityFilter("all");
    setCallStatusFilter("all");
  }

  function isRmQuickFilterActive(item: (typeof RM_QUICK_FILTERS)[number]) {
    if (item.kind === "priority") return priorityFilter === item.id;
    if (item.kind === "call") return callStatusFilter === item.id;
    return riskFilter === item.id;
  }

  function rmQuickFilterLabel(item: (typeof RM_QUICK_FILTERS)[number]) {
    if (item.kind === "priority") {
      return PRIORITY_FILTERS.find((p) => p.id === item.id)?.label ?? item.id;
    }
    if (item.kind === "call") {
      return CALL_STATUS_FILTERS.find((c) => c.id === item.id)?.label ?? item.id;
    }
    return RISK_FILTERS.find((r) => r.id === item.id)?.label ?? item.id;
  }

  async function setPriorityTag(pipelineId: string, priorityTag: Row["priorityTag"]) {
    await fetch(`/api/sales/pipeline/${pipelineId}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priorityTag }),
    });
    setRows((prev) => prev.map((r) => (r.id === pipelineId ? { ...r, priorityTag } : r)));
  }

  const segmentTheme =
    segment === "candidate"
      ? {
          label: "Potential",
          subtitle: "New MUAs in pipeline",
          banner: "border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50",
          pillActive: "border-teal-700 bg-teal-700 text-white shadow-sm",
          pillIdle: "border-teal-200 bg-white text-teal-900 hover:border-teal-400",
          kanbanWrap: "rounded-xl border-2 border-teal-200/80 bg-teal-50/30 p-3",
          column: "border-teal-200 bg-white/90",
          columnBadge: "bg-teal-100 text-teal-900",
          card: "border-teal-100 hover:border-teal-300 hover:bg-teal-50/40",
          hint: "Focus on first-touch and conversion for new leads.",
        }
      : segment === "renewal"
        ? {
            label: "Renewal",
            subtitle: "On plan · expiring in ~30 days",
            banner: "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50",
            pillActive: "border-amber-700 bg-amber-700 text-white shadow-sm",
            pillIdle: "border-amber-200 bg-white text-amber-900 hover:border-amber-400",
            kanbanWrap: "rounded-xl border-2 border-amber-200/80 bg-amber-50/30 p-3",
            column: "border-amber-200 bg-white/90",
            columnBadge: "bg-amber-100 text-amber-900",
            card: "border-amber-100 hover:border-amber-300 hover:bg-amber-50/40",
            hint: "Renewal outreach while MUA is still active on plan — same targets as win-back.",
          }
        : {
            label: "Re-engage",
            subtitle: "Existing MUAs · no active plan",
            banner: "border-violet-200 bg-gradient-to-r from-violet-50 to-amber-50",
            pillActive: "border-violet-700 bg-violet-700 text-white shadow-sm",
            pillIdle: "border-violet-200 bg-white text-violet-900 hover:border-violet-400",
            kanbanWrap: "rounded-xl border-2 border-violet-200/80 bg-violet-50/30 p-3",
            column: "border-violet-200 bg-white/90",
            columnBadge: "bg-violet-100 text-violet-900",
            card: "border-violet-100 hover:border-violet-300 hover:bg-violet-50/40",
            hint: "Win-back motion for expired-plan MUAs — prioritize contact recency and plan revival.",
          };

  return (
    <div className="space-y-4">
      {isPersonalView ? (
        <p className="text-sm text-slate-600">
          Your assigned MUAs only — use <span className="font-medium">Team Analysis</span> to review your team&apos;s pipeline.
        </p>
      ) : null}
      <div className={`rounded-xl border p-4 ${segmentTheme.banner}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Pipeline segment</p>
            <p className="text-lg font-bold text-brand">{segmentTheme.label}</p>
            <p className="text-xs text-slate-muted">{segmentTheme.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSegment("candidate")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${segment === "candidate" ? segmentTheme.pillActive : "border-teal-200 bg-white text-teal-900 hover:border-teal-400"}`}
            >
              Potential
            </button>
            <button
              type="button"
              onClick={() => setSegment("renewal")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${segment === "renewal" ? segmentTheme.pillActive : "border-amber-200 bg-white text-amber-900 hover:border-amber-400"}`}
            >
              Renewal
            </button>
            <button
              type="button"
              onClick={() => setSegment("re_engage")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${segment === "re_engage" ? segmentTheme.pillActive : "border-violet-200 bg-white text-violet-900 hover:border-violet-400"}`}
            >
              Re-engage
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-600">{segmentTheme.hint}</p>
      </div>

      {isPersonalView ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => setTodayTasksOnly(true)}
            className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-brand/40 hover:bg-slate-50"
          >
            <p className="text-xs text-slate-500">Today&apos;s tasks</p>
            <p className="text-2xl font-bold text-brand">{todayTasks}</p>
          </button>
          <button
            type="button"
            onClick={() => setTodayTasksOnly(true)}
            className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-brand/40 hover:bg-slate-50"
          >
            <p className="text-xs text-slate-500">Overdue tasks</p>
            <p className="text-2xl font-bold text-brand">{overdueTasks}</p>
          </button>
          <button
            type="button"
            onClick={() => setContactRiskFilter("notContacted")}
            className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-brand/40 hover:bg-slate-50"
          >
            <p className="text-xs text-slate-500">Stale (3d+ no contact)</p>
            <p className="text-2xl font-bold text-brand">{totals.stale}</p>
          </button>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">In pipeline · {totals.hot} hot</p>
            <p className="text-2xl font-bold text-brand">{totals.total}</p>
            <p className="mt-1 text-xs text-slate-muted">₹{totals.pipelineValue.toLocaleString("en-IN")} deal value*</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Total MUAs</p><p className="text-2xl font-bold text-brand">{totals.total}</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Today&apos;s Tasks</p><p className="text-2xl font-bold text-brand">{todayTasks}</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Overdue Tasks</p><p className="text-2xl font-bold text-brand">{overdueTasks}</p></div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Unassigned</p><p className="text-2xl font-bold text-brand">{totals.unassigned}</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Stale (3d+)</p><p className="text-2xl font-bold text-brand">{totals.stale}</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Deal Value In Pipeline*</p><p className="text-2xl font-bold text-brand">₹{totals.pipelineValue.toLocaleString("en-IN")}</p></div>
          </div>
        </>
      )}
      <p className="text-xs text-slate-muted">*Deal value from Price Offered at Details Shared stage onward.</p>

      {isPersonalView ? (
        <TodaysFocusTray
          items={todaysFocusItems}
          focusActive={todaysFocusOnly}
          onFilterFocus={() => setTodaysFocusOnly((v) => !v)}
          onOpenFocusItem={handleOpenFocusItem}
          onContactLogged={() => void refreshAfterFocusAction()}
        />
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isPersonalView ? "Work queue" : "Pipeline filters"}
          </p>
          {hasActiveClientFilters ? (
            <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>
          ) : null}
        </div>

        {isPersonalView ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <FilterChip active={todayTasksOnly} onClick={() => setTodayTasksOnly((v) => !v)}>
                {todayTasksOnly ? "Today's tasks ✓" : "Today's tasks"}
              </FilterChip>
              {onboardingPipelineIds.size > 0 ? (
                <FilterChip active={onboardingOnly} onClick={() => setOnboardingOnly((v) => !v)}>
                  {onboardingOnly
                    ? "Onboarding ✓"
                    : `Onboarding (${onboardingPipelineIds.size})`}
                </FilterChip>
              ) : null}
              {todaysFocusItems.length > 0 ? (
                <FilterChip active={todaysFocusOnly} onClick={() => setTodaysFocusOnly((v) => !v)}>
                  {todaysFocusOnly ? "Today's focus ✓" : `Today's focus (${todaysFocusItems.length})`}
                </FilterChip>
              ) : null}
              {RM_QUICK_FILTERS.map((item) => (
                <FilterChip
                  key={`${item.kind}-${item.id}`}
                  active={isRmQuickFilterActive(item)}
                  onClick={() => toggleRmQuickFilter(item)}
                >
                  {rmQuickFilterLabel(item)}
                </FilterChip>
              ))}
              <FilterChip
                active={priorityFilter === "follow_up"}
                onClick={() => setPriorityFilter((p) => (p === "follow_up" ? "all" : "follow_up"))}
              >
                📞 Follow-up
              </FilterChip>
              <FilterChip
                active={priorityFilter === "untagged"}
                onClick={() => setPriorityFilter((p) => (p === "untagged" ? "all" : "untagged"))}
              >
                Untagged
              </FilterChip>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
              <Input
                placeholder="Search name, city, phone, source…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">All stages</option>
                {PIPELINE_STAGE_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button
                size="sm"
                variant={showAdvancedFilters ? "primary" : "secondary"}
                onClick={() => setShowAdvancedFilters((v) => !v)}
              >
                More{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
              </Button>
            </div>
            {showAdvancedFilters ? (
              <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-2 xl:grid-cols-4">
                <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                  <option value="">All sources</option>
                  {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={contactRiskFilter} onChange={(e) => setContactRiskFilter(e.target.value as "all" | "notContacted" | "contacted")}>
                  <option value="all">All contact status</option>
                  <option value="notContacted">Not contacted (3d+)</option>
                  <option value="contacted">Recently contacted</option>
                </select>
                <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as "updated" | "daysInStage" | "name")}>
                  <option value="updated">Sort: latest</option>
                  <option value="daysInStage">Sort: stage age</option>
                  <option value="name">Sort: name</option>
                </select>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Updated from" />
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Updated to" />
                <Input placeholder="Min price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                <Input placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              {PRIORITY_FILTERS.map((pf) => (
                <FilterChip key={pf.id} active={priorityFilter === pf.id} onClick={() => setPriorityFilter(pf.id)}>
                  {pf.label}
                </FilterChip>
              ))}
              <FilterChip active={todayTasksOnly} onClick={() => setTodayTasksOnly((v) => !v)}>
                {todayTasksOnly ? "Today's tasks ✓" : "Today's tasks"}
              </FilterChip>
              {onboardingPipelineIds.size > 0 ? (
                <FilterChip active={onboardingOnly} onClick={() => setOnboardingOnly((v) => !v)}>
                  {onboardingOnly
                    ? "Onboarding ✓"
                    : `Onboarding (${onboardingPipelineIds.size})`}
                </FilterChip>
              ) : null}
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {RISK_FILTERS.map((rf) => (
                <FilterChip key={rf.id} active={riskFilter === rf.id} onClick={() => setRiskFilter(rf.id)}>
                  {rf.label}
                </FilterChip>
              ))}
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {CALL_STATUS_FILTERS.map((cs) => (
                <FilterChip key={cs.id} active={callStatusFilter === cs.id} onClick={() => setCallStatusFilter(cs.id)}>
                  {cs.label}
                </FilterChip>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
              <Input
                placeholder="Search name, city, phone, source, stage, team, assignee…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">All stages</option>
                {PIPELINE_STAGE_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={assignment} onChange={(e) => setAssignment(e.target.value as "all" | "assigned" | "unassigned")}>
                <option value="all">All assignments</option>
                <option value="assigned">Assigned</option>
                <option value="unassigned">Unassigned</option>
              </select>
              {isAdminView ? (
                <>
                  <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                    <option value="">All salespersons</option>
                    {assigneeOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                    <option value="">All teams</option>
                    {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </>
              ) : null}
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="">All sources</option>
                {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={contactRiskFilter} onChange={(e) => setContactRiskFilter(e.target.value as "all" | "notContacted" | "contacted")}>
                <option value="all">All contact status</option>
                <option value="notContacted">Not contacted (3d+)</option>
                <option value="contacted">Recently contacted</option>
              </select>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Updated from" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Updated to" />
              <Input placeholder="Min price offered" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
              <Input placeholder="Max price offered" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as "updated" | "daysInStage" | "name")}>
                <option value="updated">Sort: latest</option>
                <option value="daysInStage">Sort: stage age</option>
                <option value="name">Sort: name</option>
              </select>
            </div>
          </>
        )}
      </div>
      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {showBulkOps && selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-brand">{selectedIds.size} selected</p>
          <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
            <option value="">Bulk assign to…</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!bulkAssignee}
            onClick={async () => {
              if (!bulkAssignee) return;
              await fetch("/api/sales/pipeline/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipelineIds: [...selectedIds], action: "assign", assignedTo: bulkAssignee }),
              });
              setSelectedIds(new Set());
              void load();
            }}
          >
            Apply assign
          </Button>
          <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value)}>
            <option value="">Set priority…</option>
            <option value="hot">Hot</option>
            <option value="follow_up">Follow-up</option>
            <option value="nurturing">Nurturing</option>
            <option value="cold">Cold</option>
            <option value="">Clear tag</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await fetch("/api/sales/pipeline/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  pipelineIds: [...selectedIds],
                  action: "priority",
                  priorityTag: bulkPriority || null,
                }),
              });
              setSelectedIds(new Set());
              void load();
            }}
          >
            Apply priority
          </Button>
          <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
            <option value="">Move to stage…</option>
            {getManualStageChangeOptions().map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (!bulkStage) return;
              await fetch("/api/sales/pipeline/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipelineIds: [...selectedIds], action: "stage", stage: bulkStage }),
              });
              setSelectedIds(new Set());
              void load();
            }}
          >
            Apply stage
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant={viewMode === "list" ? "primary" : "secondary"} onClick={() => setViewMode("list")}>List</Button>
          <Button variant={viewMode === "kanban" ? "primary" : "secondary"} onClick={() => setViewMode("kanban")}>Kanban</Button>
        </div>
        {!loading ? (
          <p className="text-sm text-slate-muted">
            {filteredRows.length} MUA{filteredRows.length === 1 ? "" : "s"}
            {rows.length !== filteredRows.length ? ` (of ${rows.length})` : ""}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading pipeline…</p>
      ) : filteredRows.length === 0 && !loadError ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-brand">No MUAs match your filters</p>
          <p className="mt-1 text-xs text-slate-muted">
            {isPersonalView
              ? "Try another segment, clear filters, or check Today's Focus for due tasks."
              : "Adjust filters or assignment scope to see pipeline rows."}
          </p>
          {hasActiveClientFilters ? (
            <Button size="sm" variant="secondary" className="mt-3" onClick={clearFilters}>Clear filters</Button>
          ) : null}
        </div>
      ) : viewMode === "list" ? (
        <Table>
          <THead>
            <TR>
              {showBulkOps ? <TH><span className="sr-only">Select</span></TH> : null}
              <TH>MUA</TH>
              <TH>City</TH>
              {!isPersonalView ? <TH>Type</TH> : null}
              <TH>Stage</TH>
              <TH>Priority</TH>
              <TH>Last note</TH>
              {!isPersonalView ? <TH>Signals</TH> : null}
              <TH>Price offered</TH>
              <TH>Days in stage</TH>
              <TH>Call status</TH>
              <TH>Contact</TH>
              {!isPersonalView ? (
                <>
                  <TH>Assigned</TH>
                  <TH>Team</TH>
                </>
              ) : null}
              <TH>AI</TH>
            </TR>
          </THead>
          <TBody>
            {filteredRows.map((r) => (
              <TR
                key={r.id}
                className={`${
                  rowFocusHighlight(r.id) ||
                  ((r.totalRepeatedNoAnswer ?? 0) >= 3 || (r.daysSinceLastContact ?? 0) >= 7)
                    ? "border-l-4 border-l-red-600"
                    : (r.priorityTag === "hot"
                      ? "border-l-4 border-l-teal-700"
                      : ((r.daysSinceLastContact ?? 0) >= 3 ? "border-l-4 border-l-amber-600" : ""))
                }`}
              >
                {showBulkOps ? (
                  <TD>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        });
                      }}
                    />
                  </TD>
                ) : null}
                <TD><button type="button" className="text-left font-medium text-accent hover:underline" onClick={() => setSelectedPipelineId(r.id)}>{r.muaName}</button></TD>
                <TD>{r.muaCity}</TD>
                {!isPersonalView ? <TD><Badge>{r.muaType}</Badge></TD> : null}
                <TD><Badge>{r.stage}</Badge></TD>
                <TD>
                  <select className="rounded border border-slate-200 px-1 py-0.5 text-xs" value={r.priorityTag ?? ""} onChange={(e) => void setPriorityTag(r.id, (e.target.value || null) as Row["priorityTag"])}>
                    <option value="">Untagged</option>
                    <option value="hot">🔥 Hot</option>
                    <option value="follow_up">📞 Follow-up</option>
                    <option value="nurturing">💬 Nurturing</option>
                    <option value="cold">❄️ Cold</option>
                  </select>
                </TD>
                <TD className="max-w-[160px] truncate text-xs text-slate-600">
                  <span title={r.lastNotePreview ?? ""}>{r.lastNotePreview ?? "—"}</span>
                </TD>
                {!isPersonalView ? (
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {rowTags(r).map((t) => (
                        <Badge key={t} variant="muted">{RISK_TAG_LABELS[t]}</Badge>
                      ))}
                      {(r.totalRepeatedNoAnswer ?? 0) >= 3 ? <Badge variant="muted">No answer</Badge> : null}
                      {rowTags(r).length === 0 && (r.totalRepeatedNoAnswer ?? 0) < 3 ? (
                        <span className="text-xs text-slate-muted">—</span>
                      ) : null}
                    </div>
                  </TD>
                ) : null}
                <TD>{r.priceOffered ? `₹${Number(r.priceOffered).toLocaleString("en-IN")}` : "—"}</TD>
                <TD>{r.daysInStage}</TD>
                <TD>
                  {(() => {
                    const pill = callPill(r);
                    const cls = pill.tone === "green" ? "bg-emerald-100 text-emerald-800" : pill.tone === "red" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700";
                    return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>📞 {pill.text}</span>;
                  })()}
                </TD>
                <TD>
                  <PipelineQuickContact
                    pipelineId={r.id}
                    muaName={r.muaName}
                    muaPhone={r.muaPhone}
                    muaWhatsapp={r.muaWhatsapp}
                    muaCity={r.muaCity}
                    stage={r.stage}
                    onLogged={load}
                  />
                </TD>
                {!isPersonalView ? (
                  <>
                    <TD>{r.assignedToName ?? "Unassigned"}</TD>
                    <TD>{r.teamName ?? "—"}</TD>
                  </>
                ) : null}
                <TD><Button size="sm" variant="secondary" onClick={() => void aiSuggest(r)} disabled={aiFor === r.id}>{aiFor === r.id ? "…" : "AI Suggest"}</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <div className={segmentTheme.kanbanWrap}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand">Kanban · {segmentTheme.label}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${segmentTheme.columnBadge}`}>
              {filteredRows.length} cards
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE_STAGE_ORDER.map((s) => (
            <div key={s} className={`rounded-lg border p-3 shadow-sm ${segmentTheme.column}`}>
              <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-200/80 pb-2">
                <p className="text-sm font-bold leading-tight text-slate-900">{s}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${segmentTheme.columnBadge}`}>{stageStats.get(s)?.total ?? 0}</span>
              </div>
              <p className="mb-2 text-[11px] text-slate-muted">Unmoved: {stageStats.get(s)?.unmoved ?? 0} · Not contacted: {stageStats.get(s)?.notContacted ?? 0}</p>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {(grouped.get(s) ?? []).map((r) => (
                  <div key={r.id} className={`w-full rounded-lg border p-2 text-left shadow-sm transition ${segmentTheme.card} ${
                    ((r.totalRepeatedNoAnswer ?? 0) >= 3 || (r.daysSinceLastContact ?? 0) >= 7)
                      ? "border-l-4 border-l-red-600"
                      : (r.priorityTag === "hot" ? "border-l-4 border-l-teal-700" : ((r.daysSinceLastContact ?? 0) >= 3 ? "border-l-4 border-l-amber-600" : ""))
                  }`}>
                    <button type="button" onClick={() => setSelectedPipelineId(r.id)} className="w-full text-left">
                    <p className="text-sm font-medium text-brand">{r.muaName}</p>
                    <p className="text-xs text-slate-muted">{r.muaCity} • {r.muaType}</p>
                    {r.priorityTag ? <p className="mt-1 text-xs">{PRIORITY_LABEL[r.priorityTag]}</p> : null}
                    {(() => {
                      const pill = callPill(r);
                      const cls = pill.tone === "green" ? "bg-emerald-100 text-emerald-800" : pill.tone === "red" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700";
                      return <p className="mt-1"><span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>📞 {pill.text}</span> <span className="text-xs text-slate-600">attempts 7d: {r.callAttemptsThisWeek ?? 0}</span></p>;
                    })()}
                    <p className="mt-1 text-xs text-slate-muted">Stage age: {r.daysInStage}d</p>
                    <p className="mt-1 text-xs text-slate-muted">Price: {r.priceOffered ? `₹${Number(r.priceOffered).toLocaleString("en-IN")}` : "—"}</p>
                    </button>
                    <PipelineQuickContact
                      pipelineId={r.id}
                      muaName={r.muaName}
                      muaPhone={r.muaPhone}
                      muaWhatsapp={r.muaWhatsapp}
                      muaCity={r.muaCity}
                      stage={r.stage}
                      layout="stacked"
                      onLogged={load}
                    />
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => void aiSuggest(r)} disabled={aiFor === r.id}>{aiFor === r.id ? "…" : "AI Suggest"}</Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {aiSuggestion ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand">AI Suggested Actions — {aiSuggestion.title}</p>
            <Button size="sm" variant="secondary" onClick={() => setAiSuggestion(null)}>Close</Button>
          </div>
          {aiSuggestion.contextMeta ? <p className="mb-2 text-xs text-slate-muted">{aiSuggestion.contextMeta}</p> : null}
          <div className="grid gap-2 md:grid-cols-2">
            {parseAiSections(aiSuggestion.text).map((s, idx) => (
              <div key={idx} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-semibold text-brand">{s.title}</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-700">
                  {s.body.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <MuaPipelineProfile
        open={Boolean(selectedPipelineId)}
        onClose={() => {
          setSelectedPipelineId(null);
          setSelectedPipelineInitialTab(undefined);
        }}
        pipelineId={selectedPipelineId}
        initialTab={selectedPipelineInitialTab}
        onPipelineUpdated={() => void refreshAfterFocusAction()}
      />

      <SalesTaskCompleteModal
        open={Boolean(completeTask) && completeTask?.taskType !== "salesOnboarding"}
        title={completeTask?.title ?? ""}
        taskType={completeTask?.taskType ?? ""}
        pipelineId={
          completeTask?.salesPipelineId ??
          completeTask?.title.match(/\[PIPE:([0-9a-f-]{36})\]/i)?.[1] ??
          null
        }
        currentStage={modalPipelineStage ?? completeTask?.salesPipelineStage ?? null}
        muaName={completeTask?.salesPipelineMuaName ?? completeTask?.muaName}
        muaPhone={completeTask?.salesPipelineMuaPhone ?? completeTask?.muaPhone}
        muaWhatsapp={completeTask?.salesPipelineMuaWhatsapp ?? completeTask?.muaWhatsapp}
        muaCity={completeTask?.salesPipelineMuaCity ?? completeTask?.muaCity}
        locked={completeTask ? seniorTaskLocked(completeTask.taskType) : false}
        initialNextFollowUpDate={
          completeTask
            ? todaysFocusItems.find((i) => i.pipelineId === (completeTask.salesPipelineId ?? completeTask.title.match(/\[PIPE:([0-9a-f-]{36})\]/i)?.[1]))?.scheduledAt ?? ""
            : ""
        }
        onClose={() => setCompleteTask(null)}
        onConfirm={(payload) => submitTaskComplete(completeTask!.id, completeTask!, payload)}
        onRequireStagePanel={handleRequireStagePanel}
      />

      {focusReschedule ? (
        <StageChangePanel
          open={Boolean(focusReschedule)}
          onClose={() => setFocusReschedule(null)}
          pipelineId={focusReschedule.pipelineId}
          currentStage={focusReschedule.stage}
          rescheduleOnly
          initialNextTouch={focusReschedule.scheduledAt}
          panelTitle={`Reschedule — ${focusReschedule.muaName}`}
          submitLabel="Save new date"
          onDone={() => {
            setFocusReschedule(null);
            void refreshAfterFocusAction();
          }}
        />
      ) : null}

      {pendingComplete && pendingPipelineId && stagePanelCurrentStage && !stagePanelLoading ? (
        <StageChangePanel
          open={stagePanelOpen}
          onClose={() => {
            setStagePanelOpen(false);
            setPendingComplete(null);
          }}
          pipelineId={pendingPipelineId}
          currentStage={stagePanelCurrentStage}
          prefill={pendingComplete.stageChangeTo}
          lockStage
          initialNote={pendingComplete.stageChangeNote ?? ""}
          initialNextTouch={pendingComplete.nextFollowUpDate ?? ""}
          panelTitle={`Complete task — move to ${pendingComplete.stageChangeTo}`}
          submitLabel="Update stage & complete task"
          onDone={(result) => void handleStagePanelDone(result)}
        />
      ) : null}
    </div>
  );
}
