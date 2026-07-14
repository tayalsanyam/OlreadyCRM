import type { TransactionSql } from "@/db/index";
import { fromDbRole } from "@/lib/db-mappers";
import { generateCareTaskDisplayId } from "@/lib/ticket-create";
import { toDbCareTaskType, toDbTaskPriority } from "@/lib/ticket-db-mappers";
import type { CareTaskPriority, SupportTicket } from "@/lib/types";

const ADMIN_ROLES = new Set(["admin", "owner"]);

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

const ASSIGNED_ROLE_MAP: Record<string, string> = {
  regionalRm: "regional_rm",
  commissionRm: "commission_rm",
  feedbackRm: "feedback_rm",
  careAgent: "care_agent",
  salesRm: "sales_rm",
  salesTl: "sales_tl",
  salesActivation: "sales_activation",
  admin: "admin",
  owner: "owner",
  leadUploader: "lead_uploader",
};

export async function resolveCareNotifyLink(
  tx: TransactionSql,
  staffId: string,
  ticketId: string
): Promise<string> {
  const [staff] = await tx<{ role: string }[]>`
    SELECT role::text AS role FROM rm.staff WHERE id = ${staffId}::uuid
  `;
  const appRole = staff ? fromDbRole(staff.role) : null;
  if (appRole === "salesRm" || appRole === "salesTl" || appRole === "salesActivation") {
    return "/sales/tasks";
  }
  if (appRole === "regionalRm" || appRole === "commissionRm" || appRole === "feedbackRm") {
    return "/rm/tasks";
  }
  if (appRole === "admin" || appRole === "owner" || appRole === "careAgent") {
    return `/care/grievances/${ticketId}`;
  }
  return "/care/tasks";
}

async function insertNotification(
  tx: TransactionSql,
  staffId: string,
  message: string,
  link: string
) {
  await tx`
    INSERT INTO notifications (staff_id, message, link)
    VALUES (${staffId}::uuid, ${message}, ${link})
  `;
}

export async function notifyWatchingAdmin(
  tx: TransactionSql,
  ticket: Pick<SupportTicket, "id" | "ticketNumber" | "assignedAdminId">,
  message: string,
  opts?: { excludeStaffId?: string; link?: string }
) {
  if (!ticket.assignedAdminId) return;
  if (opts?.excludeStaffId && opts.excludeStaffId === ticket.assignedAdminId) return;

  const link =
    opts?.link ?? (await resolveCareNotifyLink(tx, ticket.assignedAdminId, ticket.id));
  await insertNotification(tx, ticket.assignedAdminId, message, link);
}

export async function notifyCareIncharge(
  tx: TransactionSql,
  ticket: Pick<SupportTicket, "id" | "ticketNumber" | "assignedTo">,
  message: string,
  opts?: { excludeStaffId?: string; link?: string }
) {
  if (!ticket.assignedTo) return;
  if (opts?.excludeStaffId && opts.excludeStaffId === ticket.assignedTo) return;

  const link =
    opts?.link ?? (await resolveCareNotifyLink(tx, ticket.assignedTo, ticket.id));
  await insertNotification(tx, ticket.assignedTo, message, link);
}

export async function notifyTicketStakeholders(
  tx: TransactionSql,
  ticket: Pick<SupportTicket, "id" | "ticketNumber" | "assignedAdminId" | "assignedTo">,
  message: string,
  opts?: { excludeStaffId?: string; link?: string; notifyCareIncharge?: boolean }
) {
  await notifyWatchingAdmin(tx, ticket, message, opts);
  if (opts?.notifyCareIncharge !== false) {
    await notifyCareIncharge(tx, ticket, message, opts);
  }
}

async function cancelPendingAdminLoopInTasks(
  tx: TransactionSql,
  ticketId: string,
  adminId?: string | null
) {
  await tx`
    UPDATE support.ticket_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE ticket_id = ${ticketId}::uuid
      AND status IN ('pending', 'in_progress')
      AND COALESCE((task_payload->>'adminLoopIn')::boolean, false) = true
      AND (
        ${adminId ?? null}::uuid IS NULL
        OR assigned_to = ${adminId ?? null}::uuid
      )
  `;
}

async function resolveAssignedRole(tx: TransactionSql, staffId: string): Promise<string | null> {
  const [staff] = await tx<{ role: string }[]>`
    SELECT role::text AS role FROM rm.staff WHERE id = ${staffId}::uuid
  `;
  if (!staff) return null;
  const appRole = fromDbRole(staff.role);
  return ASSIGNED_ROLE_MAP[appRole] ?? staff.role;
}

export async function loopInAdminOnTicket(
  tx: TransactionSql,
  opts: {
    ticket: SupportTicket;
    adminId: string;
    brief?: string;
    dueAt?: string | null;
    priority?: CareTaskPriority;
    createdBy: string;
  }
): Promise<{ taskId: string; displayId: string }> {
  const [admin] = await tx<{ id: string; name: string; role: string }[]>`
    SELECT id, name, role::text AS role
    FROM rm.staff
    WHERE id = ${opts.adminId}::uuid AND active = true
  `;

  if (!admin || !isAdminRole(fromDbRole(admin.role))) {
    throw new Error("Select an active admin or owner");
  }

  await cancelPendingAdminLoopInTasks(tx, opts.ticket.id, opts.adminId);

  await tx`
    UPDATE support.tickets
    SET assigned_admin_id = ${opts.adminId}::uuid, updated_at = NOW()
    WHERE id = ${opts.ticket.id}::uuid
  `;

  const displayId = await generateCareTaskDisplayId(tx);
  const title = `Admin review — ${opts.ticket.ticketNumber}`;
  const description =
    opts.brief?.trim() ||
    "Care team looped you in for parallel review while the ticket stays in the current stage.";

  const assignedRole = await resolveAssignedRole(tx, opts.adminId);
  const dueAt =
    opts.dueAt ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    })();

  const [row] = await tx<{ id: string }[]>`
    INSERT INTO support.ticket_tasks (
      ticket_id,
      display_id,
      task_type,
      title,
      description,
      assigned_to,
      assigned_role,
      priority,
      due_at,
      task_payload,
      created_by
    ) VALUES (
      ${opts.ticket.id}::uuid,
      ${displayId},
      ${toDbCareTaskType("adminReview")}::support.care_task_type,
      ${title},
      ${description},
      ${opts.adminId}::uuid,
      ${assignedRole}::rm.user_role,
      ${toDbTaskPriority(opts.priority ?? "high")}::support.task_priority,
      ${dueAt},
      ${tx.json({ adminLoopIn: true, ticketStatus: opts.ticket.status })},
      ${opts.createdBy}::uuid
    )
    RETURNING id
  `;

  const taskId = row?.id;
  if (!taskId) throw new Error("Failed to create admin review task");

  const link = await resolveCareNotifyLink(tx, opts.adminId, opts.ticket.id);
  await insertNotification(
    tx,
    opts.adminId,
    `Admin loop-in ${opts.ticket.ticketNumber}: ${title}`,
    link
  );

  await tx`
    INSERT INTO support.ticket_interventions (ticket_id, admin_id, action, payload)
    VALUES (
      ${opts.ticket.id}::uuid,
      ${opts.adminId}::uuid,
      'admin_loop_in',
      ${tx.json({ brief: description, taskId, displayId })}
    )
  `;

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${opts.ticket.id}::uuid,
      ${opts.createdBy}::uuid,
      ${`Admin looped in: ${admin.name} (${displayId})${opts.brief?.trim() ? `\n${opts.brief.trim()}` : ""}`},
      true
    )
  `;

  return { taskId, displayId };
}
