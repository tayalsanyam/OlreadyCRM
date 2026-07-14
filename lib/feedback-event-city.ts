import type { LeadEvent } from "@/lib/types";

export function resolveFeedbackEventCity(
  lead: { city?: string | null; eventLocation?: string | null },
  events?: LeadEvent[] | null
): string {
  const today = new Date().toISOString().slice(0, 10);
  const past = (events ?? [])
    .filter(
      (e) =>
        (e.status as string) !== "not_needed" &&
        e.eventDate &&
        e.eventDate.slice(0, 10) <= today &&
        e.eventLocation?.trim()
    )
    .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));

  const fromCeremony = past[0]?.eventLocation?.trim();
  if (fromCeremony) return fromCeremony;

  const summary = lead.eventLocation?.trim();
  if (summary && summary !== "Multiple venues") return summary;

  return lead.city?.trim() || "your city";
}
