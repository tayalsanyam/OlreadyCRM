/** Read a DB row field whether postgres.js returned camelCase or snake_case. */
export function exportCell(
  row: Record<string, unknown>,
  ...keys: string[]
): string | number {
  for (const key of keys) {
    const v = row[key];
    if (v === undefined || v === null) continue;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") return JSON.stringify(v);
    return v as string | number;
  }
  return "";
}

export function formatPushStage(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
