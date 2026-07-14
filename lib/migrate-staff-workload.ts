import {
  generateTaskDisplayId,
  insertAuditLog,
  type TransactionSql,
} from "@/db/index";
import { fromDbRole } from "@/lib/db-mappers";
import { onLeadOwnerHandover } from "@/lib/lead-owner-handover";
import type { Region, UserRole } from "@/lib/types";

export const MIGRATABLE_ROLES: UserRole[] = [
  "regionalRm",
  "commissionRm",
  "salesRm",
  "salesTl",
  "feedbackRm",
  "salesActivation",
];

export type WorkloadPreview = {
  pendingTasks: number;
  brideLeadsAssigned: number;
  muasAssignedRm: number;
  salesPipelinesActive: number;
  muasSalesClosedBy: number;
  salesTeamsAsLead: number;
  leadRegions: Region[];
};

export type RegionMismatch = {
  missingRegions: Region[];
  sourceLeadRegions: Region[];
  targetRegions: Region[];
};

export type MigrateStaffOptions = {
  /** Merge these regions onto the successor before migrating (regional RM). */
  addRegionsToTarget?: Region[];
  /** Skip region coverage check (not recommended). */
  skipRegionCheck?: boolean;
};

export async function loadStaffForMigrate(
  tx: TransactionSql,
  staffId: string,
): Promise<{
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  regions: Region[];
} | null> {
  const [row] = await tx<
    { id: string; name: string; role: string; active: boolean; regions: string[] | null }[]
  >`
    SELECT id, name, role::text, active, regions::text[]
    FROM staff WHERE id = ${staffId}::uuid
  `;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: fromDbRole(row.role),
    active: row.active,
    regions: (row.regions ?? []) as Region[],
  };
}

export async function previewStaffWorkload(
  tx: TransactionSql,
  fromId: string,
  role: UserRole,
): Promise<WorkloadPreview> {
  const base = {
    pendingTasks: 0,
    brideLeadsAssigned: 0,
    muasAssignedRm: 0,
    salesPipelinesActive: 0,
    muasSalesClosedBy: 0,
    salesTeamsAsLead: 0,
    leadRegions: [] as Region[],
  };

  if (role === "regionalRm" || role === "commissionRm") {
    const leadFilter =
      role === "regionalRm"
        ? tx`assigned_rm_id = ${fromId}::uuid AND status = 'assigned'`
        : tx`assigned_rm_id = ${fromId}::uuid AND status = 'commission_rm'`;

    const [leads] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM bride_leads WHERE ${leadFilter}
    `;
    base.brideLeadsAssigned = leads?.count ?? 0;

    if (role === "regionalRm") {
      const regions = await tx<{ region: string }[]>`
        SELECT DISTINCT region::text AS region
        FROM bride_leads
        WHERE assigned_rm_id = ${fromId}::uuid AND status = 'assigned'
      `;
      base.leadRegions = regions.map((r: { region: string }) => r.region as Region);

      const [muas] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM muas
        WHERE assigned_rm_id = ${fromId}::uuid AND status = 'active'
      `;
      base.muasAssignedRm = muas?.count ?? 0;
    }
  }

  if (
    role === "regionalRm" ||
    role === "salesRm" ||
    role === "feedbackRm" ||
    role === "salesActivation" ||
    role === "commissionRm"
  ) {
    const [tasks] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM rm_tasks
      WHERE staff_id = ${fromId}::uuid AND status = 'pending'
    `;
    base.pendingTasks = tasks?.count ?? 0;
  }

  if (role === "salesRm") {
    const [pipes] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM sales.pipeline
      WHERE assigned_to = ${fromId}::uuid AND status = 'active'
    `;
    base.salesPipelinesActive = pipes?.count ?? 0;

    const [muas] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM muas
      WHERE sales_closed_by = ${fromId}::uuid AND status = 'active'
    `;
    base.muasSalesClosedBy = muas?.count ?? 0;
  }

  if (role === "salesTl") {
    const [teams] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM sales.teams WHERE tl_id = ${fromId}::uuid
    `;
    base.salesTeamsAsLead = teams?.count ?? 0;
  }

  return base;
}

export function computeRegionMismatch(
  leadRegions: Region[],
  targetRegions: Region[],
): RegionMismatch | null {
  const targetSet = new Set(targetRegions);
  const missingRegions = [...new Set(leadRegions)].filter((r) => !targetSet.has(r));
  if (!missingRegions.length) return null;
  return {
    missingRegions,
    sourceLeadRegions: [...new Set(leadRegions)],
    targetRegions: [...targetRegions],
  };
}

export function assertSameRoleMigrate(
  fromRole: UserRole,
  toRole: UserRole,
): void {
  if (!MIGRATABLE_ROLES.includes(fromRole)) {
    throw Object.assign(
      new Error(`Workload migration is not supported for role ${fromRole}`),
      { status: 400 },
    );
  }
  if (fromRole !== toRole) {
    throw Object.assign(
      new Error("Successor must have the same role as the departing user"),
      { status: 400 },
    );
  }
}

export async function migrateStaffWorkload(
  tx: TransactionSql,
  params: {
    fromId: string;
    toId: string;
    actorId: string;
    options?: MigrateStaffOptions;
  },
): Promise<{ preview: WorkloadPreview; moved: WorkloadPreview; regionMismatchResolved: boolean }> {
  const { fromId, toId, actorId, options = {} } = params;

  if (fromId === toId) {
    throw Object.assign(new Error("Cannot migrate workload to the same user"), { status: 400 });
  }

  const from = await loadStaffForMigrate(tx, fromId);
  const to = await loadStaffForMigrate(tx, toId);
  if (!from || !to) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  if (!to.active) {
    throw Object.assign(new Error("Successor must be an active user"), { status: 400 });
  }
  assertSameRoleMigrate(from.role, to.role);

  const preview = await previewStaffWorkload(tx, fromId, from.role);

  if (from.role === "regionalRm" && preview.leadRegions.length && !options.skipRegionCheck) {
    let targetRegions = [...to.regions];
    if (options.addRegionsToTarget?.length) {
      targetRegions = [...new Set([...targetRegions, ...options.addRegionsToTarget])];
      await tx`
        UPDATE staff SET
          regions = ${targetRegions}::region[],
          region = COALESCE(${targetRegions[0] ?? null}::region, region),
          updated_at = NOW()
        WHERE id = ${toId}::uuid
      `;
    }
    const mismatch = computeRegionMismatch(preview.leadRegions, targetRegions);
    if (mismatch) {
      throw Object.assign(
        new Error(
          `Successor does not cover region(s): ${mismatch.missingRegions.join(", ")}. Add those regions to ${to.name} or pass addRegionsToTarget.`,
        ),
        { status: 409, regionMismatch: mismatch },
      );
    }
  }

  const moved: WorkloadPreview = {
    pendingTasks: 0,
    brideLeadsAssigned: 0,
    muasAssignedRm: 0,
    salesPipelinesActive: 0,
    muasSalesClosedBy: 0,
    salesTeamsAsLead: 0,
    leadRegions: [],
  };

  const [toStaff] = await tx<{ name: string }[]>`
    SELECT name FROM staff WHERE id = ${toId}::uuid
  `;
  const toName = toStaff?.name ?? "successor";

  if (from.role === "regionalRm") {
    const leads = await tx<
      { id: string; brideName: string; displayId: string }[]
    >`
      UPDATE bride_leads SET
        assigned_rm_id = ${toId}::uuid,
        updated_at = NOW()
      WHERE assigned_rm_id = ${fromId}::uuid AND status = 'assigned'
      RETURNING id, bride_name AS "brideName", display_id AS "displayId"
    `;
    moved.brideLeadsAssigned = leads.length;
    for (const lead of leads) {
      await onLeadOwnerHandover(tx, {
        leadId: lead.id,
        newStaffId: toId,
        previousStaffId: fromId,
        brideName: lead.brideName,
        displayId: lead.displayId,
        actorId,
      });
    }

    const muas = await tx<{ id: string }[]>`
      UPDATE muas SET assigned_rm_id = ${toId}::uuid, updated_at = NOW()
      WHERE assigned_rm_id = ${fromId}::uuid AND status = 'active'
      RETURNING id
    `;
    moved.muasAssignedRm = muas.length;
  }

  if (from.role === "commissionRm") {
    const leads = await tx<
      { id: string; brideName: string; displayId: string }[]
    >`
      UPDATE bride_leads SET
        assigned_rm_id = ${toId}::uuid,
        updated_at = NOW()
      WHERE assigned_rm_id = ${fromId}::uuid AND status = 'commission_rm'
      RETURNING id, bride_name AS "brideName", display_id AS "displayId"
    `;
    moved.brideLeadsAssigned = leads.length;
    for (const lead of leads) {
      await onLeadOwnerHandover(tx, {
        leadId: lead.id,
        newStaffId: toId,
        previousStaffId: fromId,
        brideName: lead.brideName,
        displayId: lead.displayId,
        actorId,
      });
    }
  }

  if (from.role === "salesRm") {
    const pipelineRows = await tx<{ id: string; assignedTo: string | null }[]>`
      SELECT id, assigned_to AS "assignedTo"
      FROM sales.pipeline
      WHERE assigned_to = ${fromId}::uuid AND status = 'active'
    `;

    for (const pipe of pipelineRows) {
      await tx`
        UPDATE sales.pipeline
        SET assigned_to = ${toId}::uuid, updated_at = NOW()
        WHERE id = ${pipe.id}::uuid
      `;
      await tx`
        INSERT INTO sales.assignment_log (pipeline_id, from_staff_id, to_staff_id, changed_by, reason)
        VALUES (
          ${pipe.id}::uuid,
          ${fromId}::uuid,
          ${toId}::uuid,
          ${actorId}::uuid,
          ${`Staff handover: ${from.name} → ${toName}`}
        )
      `;
      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
        VALUES (
          ${pipe.id}::uuid,
          'stageChanged',
          ${`Workload migrated from ${from.name} to ${toName} (admin)`},
          ${actorId}::uuid
        )
      `;
    }
    moved.salesPipelinesActive = pipelineRows.length;

    const closedMuas = await tx<{ id: string }[]>`
      UPDATE muas SET sales_closed_by = ${toId}::uuid, updated_at = NOW()
      WHERE sales_closed_by = ${fromId}::uuid AND status = 'active'
      RETURNING id
    `;
    moved.muasSalesClosedBy = closedMuas.length;

    await tx`
      UPDATE sales.pipeline
      SET sales_closed_by = ${toId}::uuid, updated_at = NOW()
      WHERE sales_closed_by = ${fromId}::uuid AND status = 'active'
    `;
  }

  if (from.role === "salesTl") {
    const teams = await tx<{ id: string }[]>`
      UPDATE sales.teams SET tl_id = ${toId}::uuid
      WHERE tl_id = ${fromId}::uuid
      RETURNING id
    `;
    moved.salesTeamsAsLead = teams.length;
  }

  const taskRoles: UserRole[] = [
    "regionalRm",
    "commissionRm",
    "salesRm",
    "feedbackRm",
    "salesActivation",
  ];
  if (taskRoles.includes(from.role)) {
    const leadScopedRoles: UserRole[] = ["regionalRm", "commissionRm"];
    const tasks = await tx<{ id: string }[]>`
      UPDATE rm_tasks SET staff_id = ${toId}::uuid, updated_at = NOW()
      WHERE staff_id = ${fromId}::uuid AND status = 'pending'
        ${
          leadScopedRoles.includes(from.role)
            ? tx`AND lead_id IS NULL`
            : tx``
        }
      RETURNING id
    `;
    moved.pendingTasks = tasks.length;
  }

  await insertAuditLog(tx, {
    tableName: "staff",
    recordId: fromId,
    action: "workload_migrated",
    actorId,
    changes: {
      fromStaffId: fromId,
      fromName: from.name,
      toStaffId: toId,
      toName,
      role: from.role,
      moved,
    },
  });

  return {
    preview,
    moved,
    regionMismatchResolved: Boolean(options.addRegionsToTarget?.length),
  };
}
