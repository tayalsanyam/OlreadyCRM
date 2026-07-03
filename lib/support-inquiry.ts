import type { TransactionSql } from "@/db/index";
import { createNotification } from "@/lib/notifications";
import { normalizePhone } from "@/lib/phone";
import { resolveSupportInquiryNotifyLink } from "@/lib/support-inquiry-workflow";
import type { SupportVisitorSegment } from "@/lib/support-chat-intake";
import { SUPPORT_SEGMENT_LABELS } from "@/lib/support-chat-intake";

export type SupportInquirySource = "chat_intake" | "interest_form";

export type CreateSupportInquiryInput = {
  sessionId?: string | null;
  visitorKind: "mua" | "bride";
  segment: SupportVisitorSegment;
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  message?: string | null;
  source: SupportInquirySource;
  force?: boolean;
};

const POTENTIAL_SEGMENTS = new Set<SupportVisitorSegment>(["potential_mua", "potential_bride"]);

export function isPotentialSupportSegment(segment: string): segment is SupportVisitorSegment {
  return POTENTIAL_SEGMENTS.has(segment as SupportVisitorSegment);
}

export async function generateSupportInquiryDisplayId(tx: TransactionSql): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^SQ-([0-9]+)$'))[1]::int),
      0
    ) + 1 AS n
    FROM support.support_inquiries
    WHERE display_id ~ '^SQ-[0-9]+$'
  `;
  return `SQ-${String(row?.n ?? 1).padStart(4, "0")}`;
}

async function resolveInquiryAssignee(tx: TransactionSql): Promise<string | null> {
  const [care] = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role = 'care_agent'::user_role AND active = true
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (care?.id) return care.id;

  const [admin] = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role IN ('admin'::user_role, 'owner'::user_role) AND active = true
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return admin?.id ?? null;
}

function inquiryTitle(input: CreateSupportInquiryInput): string {
  const label = SUPPORT_SEGMENT_LABELS[input.segment] ?? input.segment;
  const kind = input.visitorKind === "mua" ? "MUA" : "Bride";
  return `${kind} inquiry — ${input.name.trim()} (${label})`;
}

export async function createSupportInquiry(
  tx: TransactionSql,
  input: CreateSupportInquiryInput,
): Promise<{ id: string; displayId: string } | null> {
  if (!input.force && !isPotentialSupportSegment(input.segment)) {
    return null;
  }

  const phoneNormalized = normalizePhone(input.phone);
  const displayId = await generateSupportInquiryDisplayId(tx);
  const assigneeId = await resolveInquiryAssignee(tx);
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 1);

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
      assigned_to,
      due_at
    )
    VALUES (
      ${input.sessionId ?? null}::uuid,
      ${displayId},
      ${input.visitorKind},
      ${input.segment},
      ${input.name.trim()},
      ${input.phone.trim()},
      ${phoneNormalized},
      ${input.email?.trim() || null},
      ${input.city?.trim() || null},
      ${input.message?.trim() || null},
      ${input.source},
      ${assigneeId}::uuid,
      ${dueAt.toISOString()}
    )
    RETURNING id
  `;

  if (input.sessionId) {
    await tx`
      UPDATE support.public_chat_sessions
      SET inquiry_id = ${row.id}::uuid
      WHERE id = ${input.sessionId}::uuid
    `;
  }

  if (assigneeId) {
    const title = inquiryTitle(input);
    const link = await resolveSupportInquiryNotifyLink(tx, assigneeId, row.id);
    await createNotification(tx, {
      userId: assigneeId,
      message: `New support inquiry ${displayId}: ${title}`,
      link,
    });
  }

  return { id: row.id, displayId };
}
