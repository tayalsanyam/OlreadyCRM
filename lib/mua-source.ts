export const MUA_SOURCE_OPTIONS = [
  "Inbound",
  "Ads",
  "Referral",
  "Instagram DM",
  "Others",
] as const;

export type MuaSource = (typeof MUA_SOURCE_OPTIONS)[number];

const ALLOWED = new Set<string>(MUA_SOURCE_OPTIONS);

/** Map free text to a value allowed by muas.source CHECK, or null if blank. */
export function normalizeMuaSource(raw: string | null | undefined): MuaSource | null {
  const value = raw?.trim();
  if (!value) return null;
  if (ALLOWED.has(value)) return value as MuaSource;
  return "Others";
}
