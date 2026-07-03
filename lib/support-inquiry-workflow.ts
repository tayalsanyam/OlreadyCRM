import type { TransactionSql } from "@/db/index";
import { fromDbRole } from "@/lib/db-mappers";
import { createNotification } from "@/lib/notifications";
import { generateSupportInquiryDisplayId } from "@/lib/support-inquiry";

export function resolveSupportInquiryTaskLink(inquiryId: string): string {
  return `/tasks/support/${inquiryId}`;
}

export async function resolveSupportInquiryNotifyLink(
  tx: TransactionSql,
  staffId: string,
  inquiryId: string,
): Promise<string> {
  const [staff] = await tx<{ role: string }[]>`
    SELECT role::text AS role FROM staff WHERE id = ${staffId}::uuid
  `;
  const appRole = staff ? fromDbRole(staff.role) : null;
  if (appRole === "admin" || appRole === "owner") {
    return `/admin/tasks?tab=support&id=${inquiryId}`;
  }
  return resolveSupportInquiryTaskLink(inquiryId);
}

type InquiryRow = {
  id: string;
  displayId: string;
  sessionId: string | null;
  visitorKind: string;
  segment: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string | null;
  city: string | null;
  message: string | null;
  source: string;
  assignedTo: string | null;
  parentInquiryId: string | null;
};

async function loadInquiry(tx: TransactionSql, id: string): Promise<InquiryRow | null> {
  const [row] = await tx<
    {
      id: string;
      displayId: string;
      sessionId: string | null;
      visitorKind: string;
      segment: string;
      name: string;
      phone: string;
      phoneNormalized: string;
      email: string | null;
      city: string | null;
      message: string | null;
      source: string;
      assignedTo: string | null;
      parentInquiryId: string | null;
    }[]
  >`
    SELECT
      id,
      display_id AS "displayId",
      session_id AS "sessionId",
      visitor_kind AS "visitorKind",
      segment,
      name,
      phone,
      phone_normalized AS "phoneNormalized",
      email,
      city,
      message,
      source,
      assigned_to AS "assignedTo",
      parent_inquiry_id AS "parentInquiryId"
    FROM support.support_inquiries
    WHERE id = ${id}::uuid
  `;
  return row ?? null;
}

export async function assignSupportInquiry(
  tx: TransactionSql,
  opts: {
    inquiryId: string;
    assignedTo: string | null;
    dueAt?: string | null;
    assignedBy: string;
    notify?: boolean;
  },
): Promise<{ id: string; displayId: string } | null> {
  const inquiry = await loadInquiry(tx, opts.inquiryId);
  if (!inquiry) return null;

  const status = opts.assignedTo ? "in_progress" : "pending";

  await tx`
    UPDATE support.support_inquiries
    SET
      assigned_to = ${opts.assignedTo}::uuid,
      assigned_by = ${opts.assignedBy}::uuid,
      due_at = COALESCE(${opts.dueAt ?? null}, due_at),
      status = ${status}::support.care_task_status,
      updated_at = NOW()
    WHERE id = ${opts.inquiryId}::uuid
  `;

  if (opts.notify !== false && opts.assignedTo) {
    const link = await resolveSupportInquiryNotifyLink(tx, opts.assignedTo, inquiry.id);
    await createNotification(tx, {
      userId: opts.assignedTo,
      message: `Support inquiry ${inquiry.displayId} assigned to you — ${inquiry.name}`,
      link,
    });
  }

  return { id: inquiry.id, displayId: inquiry.displayId };
}

export async function createSupportInquiryFollowUp(
  tx: TransactionSql,
  opts: {
    parentInquiryId: string;
    assignedTo?: string | null;
    dueAt?: string | null;
    message?: string | null;
    assignedBy: string;
    notify?: boolean;
  },
): Promise<{ id: string; displayId: string } | null> {
  const parent = await loadInquiry(tx, opts.parentInquiryId);
  if (!parent) return null;

  const displayId = await generateSupportInquiryDisplayId(tx);
  const dueAt = opts.dueAt ? new Date(opts.dueAt) : new Date();
  if (!opts.dueAt) dueAt.setDate(dueAt.getDate() + 1);

  const assignee = opts.assignedTo ?? parent.assignedTo;

  const [row] = await tx<{ id: string }[]>`
    INSERT INTO support.support_inquiries (
      session_id,
      display_id,
      visitor_kind,
      segment,
      name,
      phone,
      phone_normalized,
      email,
      city,
      message,
      source,
      status,
      assigned_to,
      assigned_by,
      due_at,
      parent_inquiry_id
    )
    VALUES (
      ${parent.sessionId}::uuid,
      ${displayId},
      ${parent.visitorKind},
      ${parent.segment},
      ${parent.name},
      ${parent.phone},
      ${parent.phoneNormalized},
      ${parent.email},
      ${parent.city},
      ${opts.message?.trim() || parent.message},
      ${parent.source},
      ${assignee ? "in_progress" : "pending"}::support.care_task_status,
      ${assignee}::uuid,
      ${opts.assignedBy}::uuid,
      ${dueAt.toISOString()},
      ${parent.id}::uuid
    )
    RETURNING id
  `;

  if (assignee && opts.notify !== false) {
    const link = await resolveSupportInquiryNotifyLink(tx, assignee, row.id);
    await createNotification(tx, {
      userId: assignee,
      message: `Follow-up ${displayId} (from ${parent.displayId}) — ${parent.name}`,
      link,
    });
  }

  return { id: row.id, displayId };
}

export async function completeSupportInquiry(
  tx: TransactionSql,
  opts: {
    inquiryId: string;
    completedBy: string;
    summary: string;
    outcome?: string | null;
    nextFollowUpAt?: string | null;
    followUpAssignedTo?: string | null;
    notifyAdmin?: boolean;
  },
): Promise<{ followUp?: { id: string; displayId: string } } | null> {
  const inquiry = await loadInquiry(tx, opts.inquiryId);
  if (!inquiry) return null;

  await tx`
    UPDATE support.support_inquiries
    SET
      status = 'done'::support.care_task_status,
      completion_notes = ${opts.summary.trim()},
      completion_outcome = ${opts.outcome?.trim() || null},
      completed_at = NOW(),
      completed_by = ${opts.completedBy}::uuid,
      updated_at = NOW()
    WHERE id = ${opts.inquiryId}::uuid
  `;

  let followUp: { id: string; displayId: string } | undefined;
  if (opts.nextFollowUpAt) {
    const created = await createSupportInquiryFollowUp(tx, {
      parentInquiryId: opts.inquiryId,
      assignedTo: opts.followUpAssignedTo ?? inquiry.assignedTo,
      dueAt: opts.nextFollowUpAt,
      message: `Follow-up after ${inquiry.displayId}: ${opts.summary.trim().slice(0, 200)}`,
      assignedBy: opts.completedBy,
    });
    if (created) followUp = created;
  }

  if (opts.notifyAdmin !== false) {
    const admins = await tx<{ id: string }[]>`
      SELECT id FROM staff
      WHERE role IN ('admin'::user_role, 'owner'::user_role) AND active = true
    `;
    for (const admin of admins) {
      if (admin.id === opts.completedBy) continue;
      await createNotification(tx, {
        userId: admin.id,
        message: `${inquiry.displayId} completed — ${inquiry.name}`,
        link: `/admin/tasks?tab=support&id=${inquiry.id}`,
      });
    }
  }

  return { followUp };
}
