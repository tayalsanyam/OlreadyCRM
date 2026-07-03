import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import type { IntakeEventUpdate } from "@/lib/lead-intake-config";
import { upsertMakeupLookProfile } from "@/lib/makeup-look-db";
import type { MakeupLookProfileInput } from "@/lib/makeup-look";

export async function applyIntakeConfirmationData(
  tx: TransactionSql,
  params: {
    leadId: string;
    actorId: string;
    events?: IntakeEventUpdate[];
    makeupLook?: MakeupLookProfileInput | null;
  }
): Promise<void> {
  if (params.events?.length) {
    for (const ev of params.events) {
      if (!ev.id) continue;
      await tx`
        UPDATE lead_events SET
          ceremony_type = COALESCE(${ev.ceremonyType?.trim() || null}, ceremony_type),
          event_date = CASE
            WHEN ${ev.eventDate !== undefined} THEN ${ev.eventDate}::date
            ELSE event_date
          END,
          event_location = CASE
            WHEN ${ev.eventLocation !== undefined} THEN ${ev.eventLocation?.trim() || null}
            ELSE event_location
          END,
          budget_amount = CASE
            WHEN ${ev.budgetAmount !== undefined} THEN ${ev.budgetAmount}
            ELSE budget_amount
          END,
          description = CASE
            WHEN ${ev.description !== undefined} THEN ${ev.description?.trim() || null}
            ELSE description
          END,
          updated_at = NOW()
        WHERE id = ${ev.id}::uuid AND lead_id = ${params.leadId}::uuid
      `;
    }

    const [minDate] = await tx<{ minDate: string | null }[]>`
      SELECT MIN(event_date)::text AS "minDate"
      FROM lead_events
      WHERE lead_id = ${params.leadId}::uuid
        AND status != 'not_needed'
        AND event_date IS NOT NULL
    `;
    if (minDate?.minDate) {
      await tx`
        UPDATE bride_leads SET event_date = ${minDate.minDate}::date, updated_at = NOW()
        WHERE id = ${params.leadId}::uuid
      `;
    }

    await appendComm(tx, {
      leadId: params.leadId,
      entryType: COMM.note,
      description: "Ceremony details updated during bride confirmation",
      actorId: params.actorId,
    });
  }

  if (params.makeupLook) {
    await upsertMakeupLookProfile(tx, params.leadId, params.makeupLook);
    await appendComm(tx, {
      leadId: params.leadId,
      entryType: COMM.note,
      description: "Makeup look preferences saved during bride confirmation",
      actorId: params.actorId,
    });
  }
}
