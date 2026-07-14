"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { SlideOver } from "@/components/ui/SlideOver";
import { CreateTicketForm } from "@/components/grievances/CreateTicketForm";
import {
  BRIDE_TICKET_CATEGORIES,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  type TicketCategoryDef,
} from "@/lib/ticket-categories";
import { raisedByTypeLabel, ticketSubmitterLabel } from "@/lib/ticket-display";
import {
  isBrideComplaintAgainstMua,
  ticketComplainantLabel,
  ticketComplaintTargetLabel,
} from "@/lib/ticket-party-display";
import {
  TICKET_STATUS_ORDER,
  TICKET_STATUS_TO_DB,
  ticketStatusLabel,
} from "@/lib/ticket-status";
import { formatDate, cn } from "@/lib/utils";

type TicketRow = {
  id: string;
  ticketNumber: string;
  raisedByType: string;
  raisedByName: string | null;
  muaName: string | null;
  brideName: string | null;
  leadDisplayId: string | null;
  leadId: string | null;
  category: string;
  status: string;
  urgency: string;
  source: string;
  slaDueAt: string | null;
  slaBreached: boolean;
  escalationLevel: number;
  createdAt: string;
  planTier: string | null;
  planExpiry: string | null;
  muaStatus: string | null;
};

function categoryLabel(
  map: Record<string, string>,
  category: string
): string {
  return map[category] ?? TICKET_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

function statusLabel(status: string, raisedByType?: string): string {
  return ticketStatusLabel(status, raisedByType);
}

function inboxPartySummary(r: TicketRow): string {
  const complainant = ticketComplainantLabel(r);
  if (isBrideComplaintAgainstMua(r)) {
    const target = ticketComplaintTargetLabel(r);
    return target ? `${complainant} · Against: ${target}` : complainant;
  }
  return ticketSubmitterLabel(r);
}

function planSegmentLabel(row: TicketRow): string {
  if (!row.muaName && !row.planTier) return "Unlinked";
  if (!row.planTier) return "Non-plan";
  if (row.planExpiry && new Date(row.planExpiry) < new Date()) {
    return "Expired plan";
  }
  return "Active plan";
}

const CATEGORY_CHIP_CLASS = (active: boolean) =>
  cn(
    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
    active
      ? "border-brand bg-brand text-white"
      : "border-slate-200 bg-white text-slate-700 hover:border-brand/40",
  );

function CategoryFilterSection({
  title,
  categories,
  activeCategory,
  activeRaisedByType,
  raisedByType,
  onSelect,
}: {
  title: string;
  categories: readonly { value: string; label: string; description?: string }[];
  activeCategory: string;
  activeRaisedByType: string;
  raisedByType: "mua" | "bride";
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">{title}</p>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onSelect(c.value)}
            className={CATEGORY_CHIP_CLASS(activeCategory === c.value && activeRaisedByType === raisedByType)}
            title={c.description}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GrievancesInboxClient() {
  const router = useRouter();
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [muaCategoryOptions, setMuaCategoryOptions] =
    useState<TicketCategoryDef[]>(TICKET_CATEGORIES);
  const [brideCategoryOptions, setBrideCategoryOptions] =
    useState<TicketCategoryDef[]>(BRIDE_TICKET_CATEGORIES);
  const [categoryLabels, setCategoryLabels] =
    useState<Record<string, string>>(TICKET_CATEGORY_LABELS);
  const [filterSelectOptions, setFilterSelectOptions] = useState<
    { value: string; label: string }[]
  >([{ value: "", label: "All categories" }]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [urgency, setUrgency] = useState("");
  const [category, setCategory] = useState("");
  const [raisedByType, setRaisedByType] = useState("");
  const [planSegment, setPlanSegment] = useState("");
  const [pipeline, setPipeline] = useState<"open" | "all" | "sla" | "escalated">("open");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [createOpen, setCreateOpen] = useState(false);
  const [issueFilterOpen, setIssueFilterOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/crm/tickets/categories?forFilters=true")
      .then((r) => r.json())
      .then((json) => {
        const data = json.data;
        if (!data) return;
        if (data.muaCategories?.length) setMuaCategoryOptions(data.muaCategories);
        if (data.brideCategories?.length) setBrideCategoryOptions(data.brideCategories);
        if (data.labelMap) {
          setCategoryLabels({ ...TICKET_CATEGORY_LABELS, ...data.labelMap });
        }
        if (data.filterOptions?.length) {
          setFilterSelectOptions([
            { value: "", label: "All categories" },
            ...data.filterOptions.map((o: { value: string; label: string }) => ({
              value: o.value,
              label: o.label,
            })),
          ]);
        }
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (urgency) params.set("urgency", urgency);
    if (category) params.set("category", category);
    if (raisedByType) params.set("raisedByType", raisedByType);
    if (planSegment) params.set("planSegment", planSegment);
    if (q.trim()) params.set("q", q.trim());
    if (pipeline === "open") params.set("openOnly", "true");
    if (pipeline === "sla") params.set("slaBreached", "true");
    if (pipeline === "escalated") params.set("escalated", "true");
    void fetch(`/api/crm/tickets?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setRows(json.data ?? []);
        setLoading(false);
      });
  }, [q, status, urgency, category, raisedByType, planSegment, pipeline]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const breached = rows.filter((r) => r.slaBreached).length;
    const high = rows.filter((r) => r.urgency === "high").length;
    const expiredPlan = rows.filter((r) => planSegmentLabel(r) === "Expired plan").length;
    const brides = rows.filter((r) => r.raisedByType === "bride").length;
    const muas = rows.filter((r) => r.raisedByType === "mua").length;
    return { total: rows.length, breached, high, expiredPlan, brides, muas };
  }, [rows]);

  const kanban = useMemo(() => {
    const map = new Map<string, TicketRow[]>();
    for (const s of TICKET_STATUS_ORDER) {
      map.set(TICKET_STATUS_TO_DB[s], []);
    }
    for (const r of rows) {
      const col = map.get(r.status) ?? map.get("received")!;
      col.push(r);
    }
    return map;
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Grievance Centre</h1>
          <p className="text-sm text-slate-muted">
            Care tickets from MUAs and brides — sorted by SLA urgency, then deadline
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create ticket</Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2">
        <button
          type="button"
          onClick={() => {
            setRaisedByType("");
            setCategory("");
          }}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            !raisedByType && !category ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-100"
          )}
        >
          All
        </button>
        {(
          [
            ["bride", "Bride tickets"],
            ["mua", "MUA tickets"],
          ] as const
        ).map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setRaisedByType(type);
              setCategory("");
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              raisedByType === type && !category
                ? "bg-brand text-white"
                : "text-slate-muted hover:bg-slate-100"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {(category || raisedByType) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-muted">Active filters:</span>
          {raisedByType && (
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-text">
              {raisedByType === "bride" ? "Bride tickets" : "MUA tickets"}
            </span>
          )}
          {category && (
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-text">
              {categoryLabel(categoryLabels, category)}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setCategory("");
              setRaisedByType("");
            }}
            className="text-xs font-medium text-brand hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setIssueFilterOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Filter by issue type</p>
            {!issueFilterOpen && category && (
              <p className="mt-0.5 truncate text-xs text-slate-muted">
                {raisedByType === "bride" ? "Bride" : raisedByType === "mua" ? "MUA" : "All"} ·{" "}
                {categoryLabel(categoryLabels, category)}
              </p>
            )}
          </div>
          <span className="shrink-0 text-slate-muted" aria-hidden>
            {issueFilterOpen ? "▾" : "▸"}
          </span>
        </button>
        {issueFilterOpen && (
          <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">
            {raisedByType !== "bride" && (
              <CategoryFilterSection
                title="MUA issue types"
                categories={muaCategoryOptions}
                activeCategory={category}
                activeRaisedByType={raisedByType}
                raisedByType="mua"
                onSelect={(value) => {
                  setCategory(value);
                  setRaisedByType("mua");
                }}
              />
            )}
            {raisedByType !== "mua" && (
              <CategoryFilterSection
                title="Bride issue types"
                categories={brideCategoryOptions}
                activeCategory={category}
                activeRaisedByType={raisedByType}
                raisedByType="bride"
                onSelect={(value) => {
                  setCategory(value);
                  setRaisedByType("bride");
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["open", "Open pipeline"],
            ["all", "All tickets"],
            ["sla", "SLA breached"],
            ["escalated", "Escalated"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPipeline(id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm",
              pipeline === id
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-brand/40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-muted">
        <span>{summary.total} shown</span>
        <span>{summary.brides} bride</span>
        <span>{summary.muas} MUA</span>
        {summary.breached > 0 && (
          <span className="font-medium text-red-600">{summary.breached} SLA breached</span>
        )}
        {summary.high > 0 && <span>{summary.high} high urgency</span>}
        {summary.expiredPlan > 0 && <span>{summary.expiredPlan} expired-plan MUAs</span>}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search ticket, bride, MUA, complaint…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            ...TICKET_STATUS_ORDER.map((s) => ({
              value: TICKET_STATUS_TO_DB[s],
              label: ticketStatusLabel(s),
            })),
          ]}
        />
        <Select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value)}
          options={[
            { value: "", label: "All urgency" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <Select
          value={raisedByType}
          onChange={(e) => setRaisedByType(e.target.value)}
          options={[
            { value: "", label: "All submitters" },
            { value: "bride", label: "Bride / lead" },
            { value: "mua", label: "MUA / artist" },
            { value: "other", label: "Other" },
          ]}
        />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={filterSelectOptions}
        />
        <Select
          value={planSegment}
          onChange={(e) => setPlanSegment(e.target.value)}
          options={[
            { value: "", label: "All MUA types" },
            { value: "active_plan", label: "Active plan" },
            { value: "expired_plan", label: "Expired plan" },
            { value: "non_plan", label: "Non-plan" },
            { value: "unlinked", label: "Unlinked MUA" },
          ]}
        />
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
        <div className="ml-auto flex gap-1 rounded-lg border border-slate-200 p-0.5">
          {(["kanban", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={cn(
                "rounded-md px-3 py-1 text-sm capitalize",
                viewMode === m ? "bg-brand text-white" : "text-slate-muted"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {TICKET_STATUS_ORDER.map((stage) => {
            const dbKey = TICKET_STATUS_TO_DB[stage];
            const cards = kanban.get(dbKey) ?? [];
            return (
              <div
                key={stage}
                className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50/50"
              >
                <div className="border-b border-slate-200 px-3 py-2">
                  <p className="text-sm font-semibold text-brand">{ticketStatusLabel(stage)}</p>
                  <p className="text-xs text-slate-muted">{cards.length} tickets</p>
                </div>
                <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
                  {cards.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-muted">Empty</p>
                  ) : (
                    cards.map((r) => (
                      <Link
                        key={r.id}
                        href={`/care/grievances/${r.id}`}
                        className={cn(
                          "block rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-brand/40",
                          r.slaBreached && "border-red-200"
                        )}
                      >
                        <p className="font-medium text-brand">{r.ticketNumber}</p>
                        <p className="truncate text-xs text-slate-muted">{inboxPartySummary(r)}</p>
                        {isBrideComplaintAgainstMua(r) && (
                          <Badge variant="critical" className="mt-1">
                            vs MUA
                          </Badge>
                        )}
                        <Badge variant="muted" className="mt-1">
                          {raisedByTypeLabel(r.raisedByType)}
                        </Badge>
                        <p className="mt-1 text-xs capitalize">
                          {categoryLabel(categoryLabels, r.category)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge variant={r.urgency === "high" ? "critical" : "muted"}>
                            {r.urgency}
                          </Badge>
                          {r.slaBreached && <Badge variant="critical">SLA</Badge>}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <Table>
        <THead>
          <TR>
            <TH>Ticket</TH>
            <TH>Type</TH>
            <TH>Submitter</TH>
            <TH>Plan</TH>
            <TH>Category</TH>
            <TH>Status</TH>
            <TH>Urgency</TH>
            <TH>SLA deadline</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={9} className="text-center text-slate-muted">
                Loading…
              </TD>
            </TR>
          ) : rows.length === 0 ? (
            <TR>
              <TD colSpan={9} className="text-center text-slate-muted">
                No tickets match filters
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id} className={cn(r.slaBreached && "bg-red-50/50")}>
                <TD>
                  <Link
                    href={`/care/grievances/${r.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {r.ticketNumber}
                  </Link>
                  {r.escalationLevel > 1 && (
                    <Badge variant="hot" className="ml-1">
                      L{r.escalationLevel}
                    </Badge>
                  )}
                </TD>
                <TD>
                  <Badge variant={r.raisedByType === "bride" ? "hot" : "muted"}>
                    {raisedByTypeLabel(r.raisedByType)}
                  </Badge>
                </TD>
                <TD>
                  {r.leadId && r.raisedByType === "bride" ? (
                    <Link
                      href={`/rm/leads/${r.leadId}`}
                      className="text-accent hover:underline"
                    >
                      {inboxPartySummary(r)}
                    </Link>
                  ) : (
                    inboxPartySummary(r)
                  )}
                  {isBrideComplaintAgainstMua(r) && (
                    <Badge variant="critical" className="ml-1">
                      vs MUA
                    </Badge>
                  )}
                </TD>
                <TD>
                  {r.raisedByType === "mua" ? (
                    <Badge
                      variant={
                        planSegmentLabel(r) === "Expired plan"
                          ? "critical"
                          : planSegmentLabel(r) === "Active plan"
                            ? "muted"
                            : "muted"
                      }
                    >
                      {planSegmentLabel(r)}
                    </Badge>
                  ) : (
                    <span className="text-slate-muted">—</span>
                  )}
                </TD>
                <TD className="capitalize">
                  {categoryLabel(categoryLabels, r.category)}
                </TD>
                <TD>
                  <Badge variant="muted">{statusLabel(r.status, r.raisedByType)}</Badge>
                </TD>
                <TD>
                  <Badge
                    variant={
                      r.urgency === "high"
                        ? "critical"
                        : r.urgency === "low"
                          ? "muted"
                          : "hot"
                    }
                  >
                    {r.urgency}
                  </Badge>
                </TD>
                <TD className={cn(r.slaBreached && "text-red-600 font-semibold")}>
                  {r.slaDueAt ? formatDate(r.slaDueAt) : "—"}
                  {r.slaBreached && <span className="ml-1 text-xs">(breached)</span>}
                </TD>
                <TD>{formatDate(r.createdAt)}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
      )}

      <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title="Create ticket">
        <div className="p-4">
          <CreateTicketForm
            onCreated={(ticket) => {
              setCreateOpen(false);
              load();
              router.push(`/care/grievances/${ticket.id}`);
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      </SlideOver>
    </div>
  );
}
