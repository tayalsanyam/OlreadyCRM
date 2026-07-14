/** Effective weekly push cap = override (or plan tier cap) + admin bonus. */
export function effectiveWeeklyCap(
  planTierCap: number,
  override: number | null | undefined,
  bonus: number | null | undefined,
): number {
  const base = override != null && override >= 0 ? override : planTierCap;
  return Math.max(0, base + (bonus ?? 0));
}
