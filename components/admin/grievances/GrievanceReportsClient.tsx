"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { TICKET_CATEGORY_LABELS } from "@/lib/ticket-categories";
import { ticketStatusLabel } from "@/lib/ticket-status";
import type {
  GrievanceActionTicket,
  GrievanceCategoryRow,
  GrievanceOpenCategoryGroup,
  GrievanceOverdueTask,
  GrievanceRaisedByRow,
  GrievanceTaskSummary,
  GrievanceReportVolume,
} from "@/lib/grievance-reports-query";
import { formatDate, cn } from "@/lib/utils";

type ActionableSnapshot = {
  taskSummary: GrievanceTaskSummary;
  openSlaBreachedCount: number;
  slaBreachedTickets: GrievanceActionTicket[];
  overdueTasks: GrievanceOverdueTask[];
  openByCategory: GrievanceOpenCategoryGroup[];
};

const RAISED_BY_LABELS: Record<string, string> = {
  mua: "MUA / artist",
  bride: "Bride / lead",
  other: "Other",
};

function categoryLabel(category: string): string {
  return TICKET_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

function useReportLinks() {
  const pathname = usePathname();
  const isCare = pathname.startsWith("/care");
  return {
    ticketHref: (id: string) => `/care/grievances/${id}`,
    muaHref: (id: string) => (isCare ? `/care/muas/${id}` : `/admin/muas/${id}`),
    inboxSlaHref: "/care/grievances?pipeline=sla",
    inboxCategoryHref: (category: string) =>
      `/care/grievances?category=${encodeURIComponent(category)}`,
    tasksHref: "/care/tasks",
    taskHref: (id: string) => `/tasks/care/${id}`,
  };
}

function TicketPartyCell({
  row,
  muaHref,
}: {
  row: {
    raisedByType: string;
    raisedByName?: string | null;
    muaId?: string | null;
    muaName?: string | null;
    brideName?: string | null;
  };
  muaHref: (id: string) => string;
}) {
  if (row.raisedByType === "mua") {
    const label = row.muaName ?? row.raisedByName ?? "MUA";
    if (row.muaId) {
      return (
        <Link href={muaHref(row.muaId)} className="text-accent hover:underline">
          {label}
        </Link>
      );
    }
    return <span>{label}</span>;
  }

  if (row.raisedByType === "bride") {
    const bride = row.brideName ?? row.raisedByName ?? "Bride";
    return (
      <span className="block">
        <span>{bride}</span>
        {row.muaName && (
          <span className="mt-0.5 block text-xs text-slate-muted">
            vs{" "}
            {row.muaId ? (
              <Link href={muaHref(row.muaId)} className="text-accent hover:underline">
                {row.muaName}
              </Link>
            ) : (
              row.muaName
            )}
          </span>
        )}
      </span>
    );
  }

  return <span>{row.raisedByName ?? "Other"}</span>;
}

function ActionStatCard({
  label,
  value,
  hint,
  alert,
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  alert?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-sm text-slate-muted">{label}</p>
      <p className={cn("text-2xl font-bold", alert && value > 0 && "text-red-600")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-muted">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-brand/30">
        {inner}
      </Link>
    );
  }

  return <Card className="p-4">{inner}</Card>;
}

export function GrievanceReportsClient() {
  const links = useReportLinks();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [volume, setVolume] = useState<GrievanceReportVolume | null>(null);
  const [byRaisedByType, setByRaisedByType] = useState<GrievanceRaisedByRow[]>([]);
  const [byCategory, setByCategory] = useState<GrievanceCategoryRow[]>([]);
  const [actionable, setActionable] = useState<ActionableSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    void fetch(`/api/admin/grievances/reports?${params}`)
      .then((r) => r.json())
      .then(
        (json: {
          data: {
            volume: GrievanceReportVolume;
            byRaisedByType: GrievanceRaisedByRow[];
            byCategory: GrievanceCategoryRow[];
            actionable: ActionableSnapshot;
          };
        }) => {
          setVolume(json.data?.volume ?? null);
          setByRaisedByType(json.data?.byRaisedByType ?? []);
          setByCategory(json.data?.byCategory ?? []);
          setActionable(json.data?.actionable ?? null);
          setLoading(false);
        }
      );
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const categoriesByType = useMemo(() => {
    const map = new Map<string, GrievanceCategoryRow[]>();
    for (const row of byCategory) {
      const list = map.get(row.raisedByType) ?? [];
      list.push(row);
      map.set(row.raisedByType, list);
    }
    return map;
  }, [byCategory]);

  function exportCsv() {
    const params = new URLSearchParams({ format: "csv" });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    window.location.href = `/api/admin/grievances/reports?${params}`;
  }

  const taskSummary = actionable?.taskSummary;
  const slaTickets = actionable?.slaBreachedTickets ?? [];
  const overdueTasks = actionable?.overdueTasks ?? [];
  const openByCategory = actionable?.openByCategory ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Care Reports</h1>
          <p className="text-sm text-slate-muted">
            Live queue health, overdue work, and ticket volume by party and issue
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          Export CSV ↓
        </Button>
      </div>

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-muted">
              Action now
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ActionStatCard
                label="Open past SLA"
                value={actionable?.openSlaBreachedCount ?? 0}
                hint="Needs immediate attention"
                alert
                href={links.inboxSlaHref}
              />
              <ActionStatCard
                label="Overdue tasks"
                value={taskSummary?.overdue ?? 0}
                hint="Care tasks past due date"
                alert
                href={links.tasksHref}
              />
              <ActionStatCard
                label="Open care tasks"
                value={taskSummary?.open ?? 0}
                hint={`${taskSummary?.dueToday ?? 0} due today`}
                href={links.tasksHref}
              />
              <ActionStatCard
                label="Open tickets"
                value={volume?.open ?? 0}
                hint={`${volume?.slaBreached ?? 0} breached in selected period`}
                href="/care/grievances"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="font-semibold text-brand">Open tickets past SLA</h3>
                  <Link href={links.inboxSlaHref} className="text-xs text-accent hover:underline">
                    View all →
                  </Link>
                </div>
                {slaTickets.length === 0 ? (
                  <p className="p-4 text-sm text-slate-muted">No open tickets past SLA</p>
                ) : (
                  <Table className="border-0 rounded-none">
                    <THead>
                      <TR>
                        <TH>Ticket</TH>
                        <TH>Party / MUA</TH>
                        <TH>Issue</TH>
                        <TH>SLA due</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {slaTickets.map((t) => (
                        <TR key={t.id}>
                          <TD>
                            <Link
                              href={links.ticketHref(t.id)}
                              className="font-medium text-accent hover:underline"
                            >
                              {t.ticketNumber}
                            </Link>
                            <p className="text-xs text-slate-muted">
                              {ticketStatusLabel(t.status)}
                              {t.openTaskCount > 0 && ` · ${t.openTaskCount} tasks`}
                            </p>
                          </TD>
                          <TD className="text-sm">
                            <TicketPartyCell row={t} muaHref={links.muaHref} />
                          </TD>
                          <TD className="text-sm">{categoryLabel(t.category)}</TD>
                          <TD className="text-sm text-red-600">
                            {t.slaDueAt ? formatDate(t.slaDueAt) : "—"}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>

              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="font-semibold text-brand">Overdue care tasks</h3>
                  <Link href={links.tasksHref} className="text-xs text-accent hover:underline">
                    Task queue →
                  </Link>
                </div>
                {overdueTasks.length === 0 ? (
                  <p className="p-4 text-sm text-slate-muted">No overdue tasks</p>
                ) : (
                  <Table className="border-0 rounded-none">
                    <THead>
                      <TR>
                        <TH>Task</TH>
                        <TH>MUA / party</TH>
                        <TH>Assignee</TH>
                        <TH>Due</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {overdueTasks.map((t) => (
                        <TR key={t.id}>
                          <TD>
                            <Link
                              href={links.taskHref(t.id)}
                              className="font-medium text-accent hover:underline"
                            >
                              {t.displayId}
                            </Link>
                            <p className="text-xs text-slate-muted capitalize">
                              {t.taskType.replace(/_/g, " ")}
                            </p>
                            <Link
                              href={links.ticketHref(t.ticketId)}
                              className="text-xs text-slate-muted hover:text-accent"
                            >
                              {t.ticketNumber}
                            </Link>
                          </TD>
                          <TD className="text-sm">
                            <TicketPartyCell row={t} muaHref={links.muaHref} />
                          </TD>
                          <TD className="text-sm">{t.assigneeName ?? "Unassigned"}</TD>
                          <TD className="text-sm text-red-600">{formatDate(t.dueAt)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-muted">
              Open tickets by issue
            </h2>
            {openByCategory.length === 0 ? (
              <Card className="p-4 text-sm text-slate-muted">No open tickets</Card>
            ) : (
              openByCategory.map((group) => (
                <Card key={group.category} className="overflow-hidden p-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-brand">{categoryLabel(group.category)}</h3>
                      <Badge variant="muted">{group.openCount} open</Badge>
                      {group.slaBreachedCount > 0 && (
                        <Badge variant="critical">{group.slaBreachedCount} past SLA</Badge>
                      )}
                    </div>
                    <Link
                      href={links.inboxCategoryHref(group.category)}
                      className="text-xs text-accent hover:underline"
                    >
                      Open in inbox →
                    </Link>
                  </div>
                  <Table className="border-0 rounded-none">
                    <THead>
                      <TR>
                        <TH>Ticket</TH>
                        <TH>MUA / party</TH>
                        <TH>Stage</TH>
                        <TH>SLA</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {group.tickets.map((t) => (
                        <TR key={t.id}>
                          <TD>
                            <Link
                              href={links.ticketHref(t.id)}
                              className="font-medium text-accent hover:underline"
                            >
                              {t.ticketNumber}
                            </Link>
                          </TD>
                          <TD className="text-sm">
                            <TicketPartyCell row={t} muaHref={links.muaHref} />
                          </TD>
                          <TD className="text-sm">{ticketStatusLabel(t.status)}</TD>
                          <TD className={cn("text-sm", t.slaBreached && "font-medium text-red-600")}>
                            {t.slaDueAt ? formatDate(t.slaDueAt) : "—"}
                            {t.slaBreached && " · breached"}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {group.openCount > group.tickets.length && (
                    <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-muted">
                      Showing {group.tickets.length} of {group.openCount}.{" "}
                      <Link
                        href={links.inboxCategoryHref(group.category)}
                        className="text-accent hover:underline"
                      >
                        View all
                      </Link>
                    </p>
                  )}
                </Card>
              ))
            )}
          </section>

          <section className="space-y-4 border-t border-slate-200 pt-6">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-muted">
                Period summary
              </h2>
              <p className="mt-1 text-xs text-slate-muted">
                Filter by ticket created date for volume and category trends
              </p>
            </div>

            <Card className="flex flex-wrap items-end gap-3 p-4">
              <Input
                label="From"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Input
                label="To"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              <Button size="sm" onClick={load}>
                Apply
              </Button>
            </Card>

            <div className="grid gap-4 sm:grid-cols-4">
              <Card className="p-4">
                <p className="text-sm text-slate-muted">Total tickets</p>
                <p className="text-2xl font-bold">{volume?.total ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-muted">Open</p>
                <p className="text-2xl font-bold">{volume?.open ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-muted">Closed</p>
                <p className="text-2xl font-bold">{volume?.closed ?? 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-slate-muted">SLA breached</p>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    (volume?.slaBreached ?? 0) > 0 && "text-red-600"
                  )}
                >
                  {volume?.slaBreached ?? 0}
                </p>
              </Card>
            </div>

            <Card className="p-4">
              <h2 className="font-semibold">By submitter</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {(["bride", "mua", "other"] as const).map((type) => {
                  const row = byRaisedByType.find((r) => r.raisedByType === type);
                  return (
                    <div
                      key={type}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                    >
                      <p className="text-sm font-medium text-brand">
                        {RAISED_BY_LABELS[type]}
                      </p>
                      <p className="mt-1 text-2xl font-bold">{row?.total ?? 0}</p>
                      <p className="mt-1 text-xs text-slate-muted">
                        {row?.open ?? 0} open · {row?.closed ?? 0} closed
                        {(row?.slaBreached ?? 0) > 0 && (
                          <span className="text-red-600"> · {row?.slaBreached} SLA</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {(["bride", "mua", "other"] as const).map((type) => {
              const rows = categoriesByType.get(type) ?? [];
              return (
                <Card key={type} className="p-4">
                  <h2 className="font-semibold">{RAISED_BY_LABELS[type]} — by category</h2>
                  <ul className="mt-3 space-y-1 text-sm">
                    {rows.map((r) => (
                      <li
                        key={`${r.raisedByType}-${r.category}`}
                        className="flex justify-between gap-4"
                      >
                        <span>{categoryLabel(r.category)}</span>
                        <span className="font-medium">{r.count}</span>
                      </li>
                    ))}
                    {rows.length === 0 && (
                      <li className="text-slate-muted">No tickets in range</li>
                    )}
                  </ul>
                </Card>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
