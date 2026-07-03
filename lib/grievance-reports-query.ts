import { sql, withTransaction, type TransactionSql } from "@/db/index";
import { rowsToCsv } from "@/lib/csv";
import { TICKET_CATEGORY_LABELS } from "@/lib/ticket-categories";
import { refreshSlaBreaches } from "@/lib/ticket-sla";

export type GrievanceReportVolume = {
  total: number;
  open: number;
  closed: number;
  slaBreached: number;
};

export type GrievanceRaisedByRow = {
  raisedByType: string;
  total: number;
  open: number;
  closed: number;
  slaBreached: number;
};

export type GrievanceCategoryRow = {
  raisedByType: string;
  category: string;
  count: number;
};

export type GrievanceTaskSummary = {
  open: number;
  overdue: number;
  dueToday: number;
};

export type GrievanceActionTicket = {
  id: string;
  ticketNumber: string;
  raisedByType: string;
  raisedByName: string | null;
  category: string;
  status: string;
  urgency: string;
  muaId: string | null;
  muaName: string | null;
  brideName: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
  assigneeName: string | null;
  openTaskCount: number;
};

export type GrievanceOverdueTask = {
  id: string;
  displayId: string;
  taskType: string;
  title: string;
  ticketId: string;
  ticketNumber: string;
  muaId: string | null;
  muaName: string | null;
  brideName: string | null;
  raisedByType: string;
  assigneeName: string | null;
  dueAt: string;
  priority: string;
};

export type GrievanceOpenCategoryGroup = {
  category: string;
  openCount: number;
  slaBreachedCount: number;
  tickets: GrievanceActionTicket[];
};

const SLA_BREACHED_PREDICATE = `
  (
    t.sla_breached
    OR (
      t.status != 'closed'
      AND t.sla_due_at IS NOT NULL
      AND t.sla_due_at < NOW()
    )
  )
`;

const ACTION_TICKET_COLUMNS = `
  t.id,
  t.ticket_number AS "ticketNumber",
  t.raised_by_type::text AS "raisedByType",
  t.raised_by_name AS "raisedByName",
  t.category,
  t.status::text AS status,
  t.urgency::text AS urgency,
  t.mua_id AS "muaId",
  m.name AS "muaName",
  bl.bride_name AS "brideName",
  t.sla_due_at AS "slaDueAt",
  (
    t.sla_breached
    OR (
      t.status != 'closed'
      AND t.sla_due_at IS NOT NULL
      AND t.sla_due_at < NOW()
    )
  ) AS "slaBreached",
  s.name AS "assigneeName",
  (
    SELECT COUNT(*)::int
    FROM support.ticket_tasks tt
    WHERE tt.ticket_id = t.id
      AND tt.status IN ('pending', 'in_progress')
  ) AS "openTaskCount"
`;

async function fetchSlaBreachedOpenTickets(
  tx: TransactionSql,
  limit = 20
): Promise<GrievanceActionTicket[]> {
  return (await tx.unsafe(`
    SELECT ${ACTION_TICKET_COLUMNS}
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN rm.staff s ON s.id = t.assigned_to
    WHERE t.status != 'closed'
      AND ${SLA_BREACHED_PREDICATE}
    ORDER BY t.sla_due_at ASC NULLS LAST, t.created_at ASC
    LIMIT ${limit}
  `)) as GrievanceActionTicket[];
}

async function fetchGrievanceTaskSummary(tx: TransactionSql): Promise<GrievanceTaskSummary> {
  const [row] = await tx<GrievanceTaskSummary[]>`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress'))::int AS open,
      COUNT(*) FILTER (
        WHERE status IN ('pending', 'in_progress')
          AND due_at IS NOT NULL
          AND due_at < NOW()
      )::int AS overdue,
      COUNT(*) FILTER (
        WHERE status IN ('pending', 'in_progress')
          AND due_at IS NOT NULL
          AND due_at::date = CURRENT_DATE
      )::int AS "dueToday"
    FROM support.ticket_tasks
  `;
  return row ?? { open: 0, overdue: 0, dueToday: 0 };
}

async function fetchOverdueCareTasks(
  tx: TransactionSql,
  limit = 20
): Promise<GrievanceOverdueTask[]> {
  return tx<GrievanceOverdueTask[]>`
    SELECT
      tt.id,
      tt.display_id AS "displayId",
      tt.task_type::text AS "taskType",
      tt.title,
      tt.ticket_id AS "ticketId",
      t.ticket_number AS "ticketNumber",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      bl.bride_name AS "brideName",
      t.raised_by_type::text AS "raisedByType",
      s.name AS "assigneeName",
      tt.due_at AS "dueAt",
      tt.priority::text AS priority
    FROM support.ticket_tasks tt
    JOIN support.tickets t ON t.id = tt.ticket_id
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN rm.staff s ON s.id = tt.assigned_to
    WHERE tt.status IN ('pending', 'in_progress')
      AND tt.due_at IS NOT NULL
      AND tt.due_at < NOW()
    ORDER BY tt.due_at ASC, tt.priority DESC, tt.created_at ASC
    LIMIT ${limit}
  `;
}

async function fetchOpenTicketsByCategory(
  tx: TransactionSql,
  perCategory = 5
): Promise<GrievanceOpenCategoryGroup[]> {
  const categoryStats = (await tx.unsafe(`
    SELECT
      t.category,
      COUNT(*)::int AS "openCount",
      COUNT(*) FILTER (WHERE ${SLA_BREACHED_PREDICATE})::int AS "slaBreachedCount"
    FROM support.tickets t
    WHERE t.status != 'closed'
    GROUP BY t.category
    HAVING COUNT(*) > 0
    ORDER BY "slaBreachedCount" DESC, "openCount" DESC, t.category
  `)) as { category: string; openCount: number; slaBreachedCount: number }[];

  if (categoryStats.length === 0) return [];

  const tickets = (await tx.unsafe(`
    SELECT * FROM (
      SELECT
        ${ACTION_TICKET_COLUMNS},
        ROW_NUMBER() OVER (
          PARTITION BY t.category
          ORDER BY
            CASE WHEN ${SLA_BREACHED_PREDICATE} THEN 0 ELSE 1 END,
            t.sla_due_at ASC NULLS LAST,
            t.created_at DESC
        ) AS "categoryRank"
      FROM support.tickets t
      LEFT JOIN muas m ON m.id = t.mua_id
      LEFT JOIN bride_leads bl ON bl.id = t.lead_id
      LEFT JOIN rm.staff s ON s.id = t.assigned_to
      WHERE t.status != 'closed'
    ) ranked
    WHERE "categoryRank" <= ${perCategory}
    ORDER BY category, "categoryRank"
  `)) as (GrievanceActionTicket & { categoryRank: number })[];

  return categoryStats.map(
    (stat: { category: string; openCount: number; slaBreachedCount: number }) => ({
      category: stat.category,
      openCount: stat.openCount,
      slaBreachedCount: stat.slaBreachedCount,
      tickets: tickets
        .filter((t: GrievanceActionTicket & { categoryRank: number }) => t.category === stat.category)
        .map(({ categoryRank: _rank, ...ticket }: GrievanceActionTicket & { categoryRank: number }) => ticket),
    })
  );
}

async function fetchActionableSnapshot(tx: TransactionSql) {
  await refreshSlaBreaches(tx);

  const [taskSummary, slaBreachedTickets, overdueTasks, openByCategory] = await Promise.all([
    fetchGrievanceTaskSummary(tx),
    fetchSlaBreachedOpenTickets(tx),
    fetchOverdueCareTasks(tx),
    fetchOpenTicketsByCategory(tx),
  ]);

  const [slaRow] = (await tx.unsafe(`
    SELECT COUNT(*)::int AS count
    FROM support.tickets t
    WHERE t.status != 'closed'
      AND ${SLA_BREACHED_PREDICATE}
  `)) as { count: number }[];

  return {
    taskSummary,
    openSlaBreachedCount: slaRow?.count ?? 0,
    slaBreachedTickets,
    overdueTasks,
    openByCategory,
  };
}

function dateFilterSql(dateFrom: string | null, dateTo: string | null) {
  return {
    dateFrom,
    dateTo,
  };
}

export async function fetchGrievanceReport(params: {
  dateFrom?: string | null;
  dateTo?: string | null;
}): Promise<{
  volume: GrievanceReportVolume;
  byRaisedByType: GrievanceRaisedByRow[];
  byCategory: GrievanceCategoryRow[];
  actionable: Awaited<ReturnType<typeof fetchActionableSnapshot>>;
}> {
  const actionable = await withTransaction(fetchActionableSnapshot);

  const { dateFrom, dateTo } = dateFilterSql(
    params.dateFrom ?? null,
    params.dateTo ?? null
  );

  const [volume] = await sql<GrievanceReportVolume[]>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status <> 'closed')::int AS open,
      COUNT(*) FILTER (WHERE status = 'closed')::int AS closed,
      COUNT(*) FILTER (WHERE sla_breached = true)::int AS "slaBreached"
    FROM support.tickets t
    WHERE (${dateFrom}::date IS NULL OR t.created_at::date >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR t.created_at::date <= ${dateTo}::date)
  `;

  const byRaisedByType = await sql<GrievanceRaisedByRow[]>`
    SELECT
      t.raised_by_type::text AS "raisedByType",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.status <> 'closed')::int AS open,
      COUNT(*) FILTER (WHERE t.status = 'closed')::int AS closed,
      COUNT(*) FILTER (WHERE t.sla_breached = true)::int AS "slaBreached"
    FROM support.tickets t
    WHERE (${dateFrom}::date IS NULL OR t.created_at::date >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR t.created_at::date <= ${dateTo}::date)
    GROUP BY t.raised_by_type
    ORDER BY
      CASE t.raised_by_type::text
        WHEN 'bride' THEN 0
        WHEN 'mua' THEN 1
        ELSE 2
      END
  `;

  const byCategory = await sql<GrievanceCategoryRow[]>`
    SELECT
      t.raised_by_type::text AS "raisedByType",
      t.category,
      COUNT(*)::int AS count
    FROM support.tickets t
    WHERE (${dateFrom}::date IS NULL OR t.created_at::date >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR t.created_at::date <= ${dateTo}::date)
    GROUP BY t.raised_by_type, t.category
    ORDER BY
      CASE t.raised_by_type::text
        WHEN 'bride' THEN 0
        WHEN 'mua' THEN 1
        ELSE 2
      END,
      count DESC
  `;

  return {
    volume: volume ?? { total: 0, open: 0, closed: 0, slaBreached: 0 },
    byRaisedByType,
    byCategory,
    actionable,
  };
}

function raisedByLabel(type: string): string {
  if (type === "mua") return "MUA / artist";
  if (type === "bride") return "Bride / lead";
  if (type === "other") return "Other";
  return type;
}

function categoryLabel(category: string): string {
  return TICKET_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

export function grievanceReportToCsv(data: {
  volume: GrievanceReportVolume;
  byRaisedByType: GrievanceRaisedByRow[];
  byCategory: GrievanceCategoryRow[];
  actionable?: Awaited<ReturnType<typeof fetchActionableSnapshot>>;
}): string {
  const headers = ["Section", "Metric", "Value"];
  const rows: unknown[][] = [
    ["Volume", "Total tickets", data.volume.total],
    ["Volume", "Open", data.volume.open],
    ["Volume", "Closed", data.volume.closed],
    ["Volume", "SLA breached", data.volume.slaBreached],
    ["", "", ""],
    ["By submitter", "Submitter type", "Total / Open / Closed / SLA breached"],
    ...data.byRaisedByType.map((r) => [
      "By submitter",
      raisedByLabel(r.raisedByType),
      `${r.total} / ${r.open} / ${r.closed} / ${r.slaBreached}`,
    ]),
    ["", "", ""],
    ["By category", "Submitter · Category", "Count"],
    ...data.byCategory.map((r) => [
      "By category",
      `${raisedByLabel(r.raisedByType)} · ${categoryLabel(r.category)}`,
      r.count,
    ]),
  ];

  if (data.actionable) {
    const a = data.actionable;
    rows.push(
      ["", "", ""],
      ["Tasks", "Open tasks", a.taskSummary.open],
      ["Tasks", "Overdue tasks", a.taskSummary.overdue],
      ["Tasks", "Due today", a.taskSummary.dueToday],
      ["", "", ""],
      ["SLA queue", "Open tickets past SLA", a.openSlaBreachedCount],
      ...a.slaBreachedTickets.map((t) => [
        "SLA queue",
        t.ticketNumber,
        `${t.muaName ?? t.brideName ?? t.raisedByName ?? "—"} · ${categoryLabel(t.category)}`,
      ]),
      ["", "", ""],
      ["Overdue tasks", "Task · Ticket", "MUA / assignee · due"],
      ...a.overdueTasks.map((t) => [
        "Overdue tasks",
        `${t.displayId} · ${t.ticketNumber}`,
        `${t.muaName ?? t.brideName ?? "—"} · ${t.assigneeName ?? "Unassigned"}`,
      ])
    );
  }

  return rowsToCsv(headers, rows);
}
