/** Normalize assign-queue search query from URL/API (`q`). */
export function normalizeAssignLeadsSearch(
  raw: string | null | undefined
): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Client-side filter for mock unassigned/assigned lists. */
export function leadMatchesAssignSearch(
  lead: { brideName: string; displayId: string; phone?: string | null },
  query: string | null
): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  const phoneDigits = needle.replace(/\D/g, "");
  const leadPhoneDigits = (lead.phone ?? "").replace(/\D/g, "");
  return (
    lead.brideName.toLowerCase().includes(needle) ||
    lead.displayId.toLowerCase().includes(needle) ||
    (lead.phone?.toLowerCase().includes(needle) ?? false) ||
    (phoneDigits.length > 0 && leadPhoneDigits.includes(phoneDigits))
  );
}
