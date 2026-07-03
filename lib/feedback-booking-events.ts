import type { TransactionSql } from "@/db/index";

type ResolveFeedbackEventOpts = {
  eventId?: string | null;
  connected: boolean;
  muaType: string;
};

/** Resolve ceremony for connected Olready feedback; legacy NULL when single/no ceremony. */
export async function resolveFeedbackEventId(
  tx: TransactionSql,
  leadId: string,
  opts: ResolveFeedbackEventOpts
): Promise<string | null> {
  if (!opts.connected || opts.muaType !== "olready") {
    return opts.eventId ?? null;
  }

  const events = await tx<
    { id: string; ceremonyType: string; eventDate: string | null }[]
  >`
    SELECT id, ceremony_type AS "ceremonyType", event_date::text AS "eventDate"
    FROM lead_events
    WHERE lead_id = ${leadId}::uuid AND status != 'not_needed'
    ORDER BY event_date NULLS LAST, ceremony_type
  `;

  if (events.length === 0) return opts.eventId ?? null;
  if (events.length === 1) return events[0]!.id;
  if (!opts.eventId) {
    throw new Error("Select which ceremony she booked this MUA for");
  }
  if (!events.some((e: { id: string }) => e.id === opts.eventId)) {
    throw new Error("Invalid ceremony for this lead");
  }
  return opts.eventId;
}
