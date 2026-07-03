export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns null for empty, whitespace, or non-UUID strings. */
export function coerceUuid(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  return UUID_RE.test(v) ? v : null;
}
