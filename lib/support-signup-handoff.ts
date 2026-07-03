import type { TransactionSql } from "@/db/index";
import { CARE_PHONE_DISPLAY } from "@/lib/care-contact";
import { createNotification } from "@/lib/notifications";
import { resolveSupportInquiryNotifyLink } from "@/lib/support-inquiry-workflow";

const SIGNUP_INTENT_RE =
  /\b(sign\s*up|signup|register|enrol(?:l)?|get\s+started|want\s+to\s+sign\s*up|join\s+olready|joining\s+olready|ready\s+to\s+join|i\s+(want|would like)\s+to\s+(join|sign\s*up|register|get\s+started)|how\s+(?:do|can)\s+i\s+(?:join|sign\s*up|register|get\s+started))\b/i;

const SIGNUP_TAG = "[Signup requested via chat]";

export function detectMuaSignupIntent(message: string): boolean {
  return SIGNUP_INTENT_RE.test(message.trim());
}

export function buildSignupHandoffReply(
  visitorFirstName?: string,
  alreadyRecorded = false,
): string {
  const first = visitorFirstName?.trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first} — ` : "";

  if (alreadyRecorded) {
    return `${hi}we already have your details on file. Our team will reach out within **24 hours**, or call/WhatsApp us directly at **${CARE_PHONE_DISPLAY}**.\n\nTeam Olready`;
  }

  return `${hi}done — we've sent your details to our team. Someone will contact you within **24 hours**.\n\nWant to talk sooner? Call or WhatsApp **${CARE_PHONE_DISPLAY}**.\n\nTeam Olready`;
}

export async function recordMuaSignupHandoff(
  tx: TransactionSql,
  sessionId: string,
  chatMessage: string,
): Promise<{ recorded: boolean; alreadyRecorded: boolean; inquiryId: string | null }> {
  const [session] = await tx<{ inquiryId: string | null }[]>`
    SELECT inquiry_id AS "inquiryId"
    FROM support.public_chat_sessions
    WHERE id = ${sessionId}::uuid
    LIMIT 1
  `;

  const inquiryId = session?.inquiryId ?? null;
  if (!inquiryId) {
    return { recorded: false, alreadyRecorded: false, inquiryId: null };
  }

  const [inquiry] = await tx<
    { message: string | null; assignedTo: string | null; displayId: string; name: string }[]
  >`
    SELECT message, assigned_to AS "assignedTo", display_id AS "displayId", name
    FROM support.support_inquiries
    WHERE id = ${inquiryId}::uuid
    LIMIT 1
  `;

  if (!inquiry) {
    return { recorded: false, alreadyRecorded: false, inquiryId };
  }

  const alreadyRecorded = (inquiry.message ?? "").includes(SIGNUP_TAG);
  if (alreadyRecorded) {
    return { recorded: false, alreadyRecorded: true, inquiryId };
  }

  const note = `${SIGNUP_TAG} ${chatMessage.trim()}`.slice(0, 2000);
  const mergedMessage = inquiry.message?.trim()
    ? `${inquiry.message.trim()}\n\n${note}`
    : note;

  await tx`
    UPDATE support.support_inquiries
    SET message = ${mergedMessage},
        updated_at = NOW(),
        status = 'pending'::support.care_task_status
    WHERE id = ${inquiryId}::uuid
  `;

  if (inquiry.assignedTo) {
    const link = await resolveSupportInquiryNotifyLink(tx, inquiry.assignedTo, inquiryId);
    await createNotification(tx, {
      userId: inquiry.assignedTo,
      message: `Signup request — ${inquiry.displayId}: ${inquiry.name} wants to join via support chat`,
      link,
    });
  }

  return { recorded: true, alreadyRecorded: false, inquiryId };
}
