import type { TransactionSql } from "@/db/index";
import { createIntakeCareTask } from "@/lib/ticket-care-workflow";
import { setTicketStatus } from "@/lib/ticket-email-workflow";
import { getTicketById } from "@/lib/ticket-create";
import { categoryTagKey } from "@/lib/ticket-categories";
import { resolvePrimaryCategory } from "@/lib/ticket-intake-lookup";
import { logCareComm, notifyAdminsOfTicket } from "@/lib/ticket-ledger";
import { savePublicIntakeAttachments } from "@/lib/public-ticket-intake";
import type { SupportTicket } from "@/lib/types";

export type TicketUpdateInput = {
  updateText: string;
  categories?: string[];
  leadIds?: string[];
  source: "internal" | "public_form";
  createdBy?: string | null;
  reopenIfClosed?: boolean;
  files?: File[];
};

export type TicketUpdateRow = {
  id: string;
  updateText: string;
  categories: string[];
  leadIds: string[];
  source: string;
  authorName: string | null;
  createdAt: string;
};

export async function appendTicketUpdate(
  tx: TransactionSql,
  ticketId: string,
  input: TicketUpdateInput
): Promise<{ ticket: SupportTicket; update: TicketUpdateRow } | null> {
  const text = input.updateText.trim();
  if (text.length < 10) {
    throw new Error("Update must be at least 10 characters");
  }

  const ticket = await getTicketById(tx, ticketId);
  if (!ticket) return null;

  const categories = [...new Set((input.categories ?? []).filter(Boolean))];
  const leadIds = [...new Set((input.leadIds ?? []).filter(Boolean))];

  const [row] = await tx<{ id: string; createdAt: string }[]>`
    INSERT INTO support.ticket_updates (
      ticket_id, update_text, categories, lead_ids, source, created_by
    ) VALUES (
      ${ticketId}::uuid,
      ${text},
      ${categories},
      ${leadIds}::uuid[],
      ${input.source},
      ${input.createdBy ?? null}
    )
    RETURNING id, created_at AS "createdAt"
  `;

  if (categories.length) {
    const primary = await resolvePrimaryCategory(tx, categories);
    const newTags = [
      ...new Set([
        ...(ticket.tags ?? []),
        ...categories.map((c) => categoryTagKey(c)),
      ]),
    ];
    await tx`
      UPDATE support.tickets
      SET category = ${primary},
          tags = ${newTags},
          updated_at = NOW()
      WHERE id = ${ticketId}::uuid
    `;
  } else {
    await tx`
      UPDATE support.tickets SET updated_at = NOW() WHERE id = ${ticketId}::uuid
    `;
  }

  const wasClosed = ticket.status === "closed";
  let current = ticket;

  if (wasClosed && input.reopenIfClosed !== false) {
    const reopened = await setTicketStatus(
      tx,
      ticket,
      "inDiscussion",
      input.createdBy ?? null,
      "Reopened — new update from customer"
    );
    if (reopened) current = reopened;
  }

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${ticketId}::uuid,
      ${input.createdBy ?? null},
      ${`Ticket update${categories.length ? ` (${categories.join(", ")})` : ""}:\n${text}`},
      true
    )
  `;

  const refreshed = await getTicketById(tx, ticketId);

  if (refreshed && wasClosed && input.reopenIfClosed !== false) {
    await createIntakeCareTask(tx, refreshed, input.createdBy);
  }

  if (refreshed?.muaId) {
    await logCareComm(tx, {
      muaId: refreshed.muaId,
      leadId: refreshed.leadId,
      entryType: "note",
      description: `Ticket update (${refreshed.ticketNumber}): ${text.slice(0, 200)}${
        text.length > 200 ? "…" : ""
      }`,
      actorId: input.createdBy ?? null,
      metadata: { ticketId, updateId: row.id, source: input.source },
    });
  }

  if (input.source === "public_form") {
    await notifyAdminsOfTicket(tx, {
      ticketId,
      ticketNumber: ticket.ticketNumber,
      message: `New update on ${ticket.ticketNumber} from public form`,
    });
  }

  if (input.files?.length) {
    await savePublicIntakeAttachments(tx, ticketId, input.files);
  }

  const [author] = input.createdBy
    ? await tx<{ name: string }[]>`
        SELECT name FROM staff WHERE id = ${input.createdBy}::uuid
      `
    : [];

  return {
    ticket: (await getTicketById(tx, ticketId))!,
    update: {
      id: row.id,
      updateText: text,
      categories,
      leadIds,
      source: input.source,
      authorName: author?.name ?? null,
      createdAt: row.createdAt,
    },
  };
}

export async function fetchTicketUpdates(
  tx: TransactionSql,
  ticketId: string
): Promise<TicketUpdateRow[]> {
  return tx<TicketUpdateRow[]>`
    SELECT
      u.id,
      u.update_text AS "updateText",
      u.categories,
      u.lead_ids AS "leadIds",
      u.source,
      s.name AS "authorName",
      u.created_at AS "createdAt"
    FROM support.ticket_updates u
    LEFT JOIN staff s ON s.id = u.created_by
    WHERE u.ticket_id = ${ticketId}::uuid
    ORDER BY u.created_at ASC
  `;
}
