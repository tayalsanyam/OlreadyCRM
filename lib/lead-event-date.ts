export type CeremonyDateInput = {
  date?: string | null;
};

/** Earliest ceremony date from rows, else top-level eventDate. */
export function resolveLeadEventDate(
  ceremonyRows: CeremonyDateInput[],
  bodyEventDate?: string | null
): string | null {
  const dates = ceremonyRows
    .map((c) => c.date?.trim())
    .filter((d): d is string => !!d);
  if (dates.length > 0) {
    return [...dates].sort()[0]!;
  }
  const top = bodyEventDate?.trim();
  return top || null;
}
