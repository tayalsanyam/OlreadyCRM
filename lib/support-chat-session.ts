import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";
import type { SupportVisitorKind, SupportVisitorSegment } from "@/lib/support-chat-intake";
import type { AiReplySource } from "@/lib/ai-reply-source";
import {
  SUPPORT_SEGMENT_LABELS,
  resolveSupportChatIntake,
} from "@/lib/support-chat-intake";

export type PublicChatSession = {
  id: string;
  name: string;
  phone: string;
  visitorKind: SupportVisitorKind;
  segment: string;
  segmentLabel: string;
  greeting: string;
  contextSnapshot: Record<string, unknown>;
};

export async function createPublicChatSession(
  tx: TransactionSql,
  input: {
    name: string;
    phone: string;
    visitorKind: SupportVisitorKind;
  },
): Promise<PublicChatSession> {
  const intake = await resolveSupportChatIntake(tx, input);
  const phoneNormalized = normalizePhone(input.phone);

  const [row] = await tx<{ id: string }[]>`
    INSERT INTO support.public_chat_sessions (
      name,
      phone,
      phone_normalized,
      visitor_kind,
      segment,
      mua_id,
      lead_id,
      context_snapshot
    )
    VALUES (
      ${input.name.trim()},
      ${input.phone.trim()},
      ${phoneNormalized},
      ${input.visitorKind},
      ${intake.segment},
      ${intake.muaId}::uuid,
      ${intake.leadId}::uuid,
      ${JSON.stringify(intake.contextSnapshot)}::jsonb
    )
    RETURNING id
  `;

  return {
    id: row.id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    visitorKind: input.visitorKind,
    segment: intake.segment,
    segmentLabel: intake.segmentLabel,
    greeting: intake.greeting,
    contextSnapshot: intake.contextSnapshot,
  };
}

export async function getPublicChatSession(
  tx: TransactionSql,
  sessionId: string,
): Promise<PublicChatSession | null> {
  const [row] = await tx<
    {
      id: string;
      name: string;
      phone: string;
      visitorKind: string;
      segment: string;
      contextSnapshot: Record<string, unknown>;
    }[]
  >`
    SELECT
      id,
      name,
      phone,
      visitor_kind AS "visitorKind",
      segment,
      context_snapshot AS "contextSnapshot"
    FROM support.public_chat_sessions
    WHERE id = ${sessionId}::uuid
    LIMIT 1
  `;

  if (!row) return null;

  const segment = row.segment as SupportVisitorSegment;

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    visitorKind: row.visitorKind as SupportVisitorKind,
    segment: row.segment,
    segmentLabel: SUPPORT_SEGMENT_LABELS[segment] ?? row.segment,
    greeting: "",
    contextSnapshot: row.contextSnapshot ?? {},
  };
}

export async function appendPublicChatMessage(
  tx: TransactionSql,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  replySource?: AiReplySource,
): Promise<void> {
  await tx`
    INSERT INTO support.public_chat_messages (session_id, role, content, reply_source)
    VALUES (
      ${sessionId}::uuid,
      ${role},
      ${content},
      ${role === "assistant" ? (replySource ?? null) : null}
    )
  `;
  await tx`
    UPDATE support.public_chat_sessions
    SET last_message_at = NOW()
    WHERE id = ${sessionId}::uuid
  `;
}
