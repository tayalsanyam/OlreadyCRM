import type postgres from "postgres";
import { fromDbRole } from "@/lib/db-mappers";
import { autofillDayEndPayload } from "@/lib/day-end-autofill";
import {
  type DayEndCheckoutRow,
  type DayEndStatus,
  type DayEndSubmissionType,
  type DayEndTemplateKey,
  addDaysToYmd,
  dayEndTemplateForRole,
  isDayEndRequiredRole,
  isNonWorkingDayIst,
  isNonWorkingDayYmd,
  todayIstYmd,
} from "@/lib/day-end";
import type { SessionUser } from "@/lib/types";

function mapCheckoutRow(row: Record<string, unknown>): DayEndCheckoutRow {
  return {
    id: String(row.id),
    staffId: String(row.staffId ?? row.staff_id),
    staffName: row.staffName != null ? String(row.staffName) : undefined,
    staffRole: row.staffRole != null ? String(row.staffRole) : undefined,
    reportDate: String(row.reportDate ?? row.report_date).slice(0, 10),
    templateKey: String(row.templateKey ?? row.template_key) as DayEndTemplateKey,
    submissionType: String(row.submissionType ?? row.submission_type) as DayEndSubmissionType,
    payload: (row.payload ?? {}) as DayEndCheckoutRow["payload"],
    submittedAt: String(row.submittedAt ?? row.submitted_at),
    updatedAt: String(row.updatedAt ?? row.updated_at),
  };
}

export async function fetchDayEndCheckout(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<DayEndCheckoutRow | null> {
  const [row] = await tx<Record<string, unknown>[]>`
    SELECT
      id,
      staff_id AS "staffId",
      report_date::text AS "reportDate",
      template_key AS "templateKey",
      submission_type AS "submissionType",
      payload,
      submitted_at AS "submittedAt",
      updated_at AS "updatedAt"
    FROM day_end_checkouts
    WHERE staff_id = ${staffId}::uuid
      AND report_date = ${reportDate}::date
  `;
  return row ? mapCheckoutRow(row) : null;
}

export async function getDayEndStatus(
  tx: postgres.Sql,
  session: SessionUser,
): Promise<DayEndStatus> {
  const today = todayIstYmd();
  const templateKey = dayEndTemplateForRole(session.role);
  const exempt = !isDayEndRequiredRole(session.role);

  if (exempt) {
    return {
      exempt: true,
      today,
      todaySubmitted: true,
      todaySubmissionType: null,
      blocked: false,
      templateKey: null,
    };
  }

  if (isNonWorkingDayIst()) {
    return {
      exempt: false,
      today,
      todaySubmitted: false,
      todaySubmissionType: null,
      blocked: false,
      templateKey,
    };
  }

  const [todayRow] = await tx<{ submissionType: string }[]>`
    SELECT submission_type AS "submissionType"
    FROM day_end_checkouts
    WHERE staff_id = ${session.userId}::uuid
      AND report_date = ${today}::date
  `;

  return {
    exempt: false,
    today,
    todaySubmitted: Boolean(todayRow),
    todaySubmissionType: todayRow
      ? (todayRow.submissionType as DayEndSubmissionType)
      : null,
    blocked: false,
    templateKey,
  };
}

export async function upsertDayEndCheckout(
  tx: postgres.Sql,
  opts: {
    staffId: string;
    reportDate: string;
    templateKey: DayEndTemplateKey;
    submissionType: DayEndSubmissionType;
    payload: Record<string, unknown>;
  },
): Promise<DayEndCheckoutRow> {
  const [row] = await tx<Record<string, unknown>[]>`
    INSERT INTO day_end_checkouts (
      staff_id,
      report_date,
      template_key,
      submission_type,
      payload
    ) VALUES (
      ${opts.staffId}::uuid,
      ${opts.reportDate}::date,
      ${opts.templateKey},
      ${opts.submissionType},
      ${tx.json(JSON.parse(JSON.stringify(opts.payload)))}
    )
    ON CONFLICT (staff_id, report_date) DO UPDATE SET
      template_key = EXCLUDED.template_key,
      submission_type = EXCLUDED.submission_type,
      payload = EXCLUDED.payload,
      updated_at = NOW()
    RETURNING
      id,
      staff_id AS "staffId",
      report_date::text AS "reportDate",
      template_key AS "templateKey",
      submission_type AS "submissionType",
      payload,
      submitted_at AS "submittedAt",
      updated_at AS "updatedAt"
  `;
  return mapCheckoutRow(row!);
}

export type DayEndOverviewStaffRow = {
  staffId: string;
  staffName: string;
  role: import("@/lib/types").UserRole;
  templateKey: DayEndTemplateKey | null;
  reportDate: string;
  status: "submitted" | "leave" | "missing";
  submittedAt: string | null;
  checkoutId: string | null;
};

export type DayEndOverview = {
  dateFrom: string;
  dateTo: string;
  rows: DayEndOverviewStaffRow[];
  summary: {
    submitted: number;
    leave: number;
    missing: number;
    total: number;
  };
};

export type DayEndCumulativeStaffRow = {
  staffId: string;
  staffName: string;
  role: import("@/lib/types").UserRole;
  workingDays: number;
  submitted: number;
  leave: number;
  missing: number;
  compliancePct: number;
  missingDates: string[];
};

export type DayEndCumulativeOverview = {
  dateFrom: string;
  dateTo: string;
  rows: DayEndCumulativeStaffRow[];
  summary: {
    workingDays: number;
    staffCount: number;
    totalSubmitted: number;
    totalLeave: number;
    totalMissing: number;
    avgCompliancePct: number;
  };
};

function workingDaysInRange(dateFrom: string, dateTo: string): string[] {
  const days: string[] = [];
  let d = dateFrom;
  while (d <= dateTo) {
    if (!isNonWorkingDayYmd(d)) days.push(d);
    d = addDaysToYmd(d, 1);
  }
  return days;
}

const OVERVIEW_ROLES = [
  "sales_rm",
  "sales_tl",
  "sales_activation",
  "lead_uploader",
  "feedback_rm",
  "regional_rm",
  "commission_rm",
  "care_agent",
] as const;

export async function fetchDayEndOverview(
  tx: postgres.Sql,
  opts: {
    dateFrom: string;
    dateTo: string;
    staffIds?: string[] | null;
    roleFilter?: string | null;
  },
): Promise<DayEndOverview> {
  const staffFilter = opts.staffIds?.length ? opts.staffIds : null;

  const staffRows = await tx<
    { id: string; name: string; role: string }[]
  >`
    SELECT id, name, role::text AS role
    FROM staff
    WHERE active = true
      AND role = ANY(${OVERVIEW_ROLES}::user_role[])
      AND (${opts.roleFilter ?? null}::text IS NULL OR role::text = ${opts.roleFilter ?? null})
      AND (
        ${staffFilter}::uuid[] IS NULL
        OR id = ANY(${staffFilter}::uuid[])
      )
    ORDER BY name
  `;

  const checkouts = await tx<
    {
      id: string;
      staffId: string;
      reportDate: string;
      templateKey: string;
      submissionType: string;
      submittedAt: string;
    }[]
  >`
    SELECT
      id,
      staff_id AS "staffId",
      report_date::text AS "reportDate",
      template_key AS "templateKey",
      submission_type AS "submissionType",
      submitted_at AS "submittedAt"
    FROM day_end_checkouts
    WHERE report_date >= ${opts.dateFrom}::date
      AND report_date <= ${opts.dateTo}::date
      AND (
        ${staffFilter}::uuid[] IS NULL
        OR staff_id = ANY(${staffFilter}::uuid[])
      )
  `;

  const checkoutByKey = new Map(
    checkouts.map((c) => [`${c.staffId}:${c.reportDate}`, c]),
  );

  const rows: DayEndOverviewStaffRow[] = [];
  let submitted = 0;
  let leave = 0;
  let missing = 0;

  for (const s of staffRows) {
    const appRole = fromDbRole(s.role);
    const templateKey = dayEndTemplateForRole(appRole);
    const key = `${s.id}:${opts.dateTo}`;
    const checkout = checkoutByKey.get(key);

    let status: DayEndOverviewStaffRow["status"] = "missing";
    if (checkout?.submissionType === "report") {
      status = "submitted";
      submitted += 1;
    } else if (checkout?.submissionType === "leave") {
      status = "leave";
      leave += 1;
    } else {
      missing += 1;
    }

    rows.push({
      staffId: s.id,
      staffName: s.name,
      role: appRole,
      templateKey,
      reportDate: opts.dateTo,
      status,
      submittedAt: checkout?.submittedAt ?? null,
      checkoutId: checkout?.id ?? null,
    });
  }

  return {
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    rows,
    summary: {
      submitted,
      leave,
      missing,
      total: staffRows.length,
    },
  };
}

export async function fetchDayEndCumulativeOverview(
  tx: postgres.Sql,
  opts: {
    dateFrom: string;
    dateTo: string;
    staffIds?: string[] | null;
    roleFilter?: string | null;
  },
): Promise<DayEndCumulativeOverview> {
  const staffFilter = opts.staffIds?.length ? opts.staffIds : null;
  const workingDays = workingDaysInRange(opts.dateFrom, opts.dateTo);

  const staffRows = await tx<{ id: string; name: string; role: string }[]>`
    SELECT id, name, role::text AS role
    FROM staff
    WHERE active = true
      AND role = ANY(${OVERVIEW_ROLES}::user_role[])
      AND (${opts.roleFilter ?? null}::text IS NULL OR role::text = ${opts.roleFilter ?? null})
      AND (
        ${staffFilter}::uuid[] IS NULL
        OR id = ANY(${staffFilter}::uuid[])
      )
    ORDER BY name
  `;

  const checkouts = await tx<
    {
      id: string;
      staffId: string;
      reportDate: string;
      submissionType: string;
    }[]
  >`
    SELECT
      id,
      staff_id AS "staffId",
      report_date::text AS "reportDate",
      submission_type AS "submissionType"
    FROM day_end_checkouts
    WHERE report_date >= ${opts.dateFrom}::date
      AND report_date <= ${opts.dateTo}::date
      AND (
        ${staffFilter}::uuid[] IS NULL
        OR staff_id = ANY(${staffFilter}::uuid[])
      )
  `;

  const byStaffDate = new Map<string, { submissionType: string; id: string }>();
  for (const c of checkouts) {
    byStaffDate.set(`${c.staffId}:${c.reportDate}`, {
      submissionType: c.submissionType,
      id: c.id,
    });
  }

  const rows: DayEndCumulativeStaffRow[] = [];
  let totalSubmitted = 0;
  let totalLeave = 0;
  let totalMissing = 0;
  let complianceSum = 0;

  for (const s of staffRows) {
    let submitted = 0;
    let leave = 0;
    const missingDates: string[] = [];

    for (const day of workingDays) {
      const checkout = byStaffDate.get(`${s.id}:${day}`);
      if (checkout?.submissionType === "report") {
        submitted += 1;
      } else if (checkout?.submissionType === "leave") {
        leave += 1;
      } else {
        missingDates.push(day);
      }
    }

    const missing = missingDates.length;
    const workingDayCount = workingDays.length;
    const compliancePct =
      workingDayCount > 0
        ? Math.round(((submitted + leave) / workingDayCount) * 100)
        : 0;

    totalSubmitted += submitted;
    totalLeave += leave;
    totalMissing += missing;
    complianceSum += compliancePct;

    rows.push({
      staffId: s.id,
      staffName: s.name,
      role: fromDbRole(s.role),
      workingDays: workingDayCount,
      submitted,
      leave,
      missing,
      compliancePct,
      missingDates,
    });
  }

  return {
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    rows,
    summary: {
      workingDays: workingDays.length,
      staffCount: staffRows.length,
      totalSubmitted,
      totalLeave,
      totalMissing,
      avgCompliancePct:
        staffRows.length > 0 ? Math.round(complianceSum / staffRows.length) : 0,
    },
  };
}

export async function loadDayEndFormData(
  tx: postgres.Sql,
  session: SessionUser,
  reportDate: string,
) {
  const templateKey = dayEndTemplateForRole(session.role);
  if (!templateKey) {
    throw Object.assign(new Error("Day end not required for this role"), { status: 403 });
  }

  const existing = await fetchDayEndCheckout(tx, session.userId, reportDate);
  const autofill = await autofillDayEndPayload(
    tx,
    templateKey,
    session.userId,
    reportDate,
  );

  return {
    reportDate,
    templateKey,
    existing,
    autofill,
    payload: existing?.submissionType === "report" ? existing.payload : autofill,
  };
}

export async function fetchDayEndReportDetail(
  tx: postgres.Sql,
  checkoutId: string,
): Promise<(DayEndCheckoutRow & { staffName: string; staffRole: string }) | null> {
  const [row] = await tx<Record<string, unknown>[]>`
    SELECT
      c.id,
      c.staff_id AS "staffId",
      s.name AS "staffName",
      s.role::text AS "staffRole",
      c.report_date::text AS "reportDate",
      c.template_key AS "templateKey",
      c.submission_type AS "submissionType",
      c.payload,
      c.submitted_at AS "submittedAt",
      c.updated_at AS "updatedAt"
    FROM day_end_checkouts c
    JOIN staff s ON s.id = c.staff_id
    WHERE c.id = ${checkoutId}::uuid
  `;
  if (!row) return null;
  const mapped = mapCheckoutRow(row);
  return {
    ...mapped,
    staffName: String(row.staffName),
    staffRole: String(row.staffRole),
  };
}

export async function fetchDayEndReportDetailForStaff(
  tx: postgres.Sql,
  checkoutId: string,
  allowedStaffIds: string[],
): Promise<(DayEndCheckoutRow & { staffName: string; staffRole: string }) | null> {
  const detail = await fetchDayEndReportDetail(tx, checkoutId);
  if (!detail) return null;
  if (!allowedStaffIds.includes(detail.staffId)) return null;
  return detail;
}

export type DayEndConsolidatedRow = DayEndCheckoutRow & {
  staffName: string;
  staffRole: import("@/lib/types").UserRole;
};

export type DayEndConsolidatedOverview = {
  dateFrom: string;
  dateTo: string;
  rows: DayEndConsolidatedRow[];
};

export async function fetchDayEndConsolidated(
  tx: postgres.Sql,
  opts: {
    dateFrom: string;
    dateTo: string;
    staffIds?: string[] | null;
    roleFilter?: string | null;
    templateFilter?: string | null;
  },
): Promise<DayEndConsolidatedOverview> {
  const staffFilter = opts.staffIds?.length ? opts.staffIds : null;

  const rows = await tx<Record<string, unknown>[]>`
    SELECT
      c.id,
      c.staff_id AS "staffId",
      s.name AS "staffName",
      s.role::text AS "staffRole",
      c.report_date::text AS "reportDate",
      c.template_key AS "templateKey",
      c.submission_type AS "submissionType",
      c.payload,
      c.submitted_at AS "submittedAt",
      c.updated_at AS "updatedAt"
    FROM day_end_checkouts c
    JOIN staff s ON s.id = c.staff_id
    WHERE c.report_date >= ${opts.dateFrom}::date
      AND c.report_date <= ${opts.dateTo}::date
      AND c.submission_type = 'report'
      AND s.active = true
      AND s.role = ANY(${OVERVIEW_ROLES}::user_role[])
      AND (${opts.roleFilter ?? null}::text IS NULL OR s.role::text = ${opts.roleFilter ?? null})
      AND (${opts.templateFilter ?? null}::text IS NULL OR c.template_key = ${opts.templateFilter ?? null})
      AND (
        ${staffFilter}::uuid[] IS NULL
        OR c.staff_id = ANY(${staffFilter}::uuid[])
      )
    ORDER BY c.report_date DESC, s.name ASC
  `;

  return {
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    rows: rows.map((row) => {
      const mapped = mapCheckoutRow(row);
      return {
        ...mapped,
        staffName: String(row.staffName),
        staffRole: fromDbRole(String(row.staffRole)),
      };
    }),
  };
}
