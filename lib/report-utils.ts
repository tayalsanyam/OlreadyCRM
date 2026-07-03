import { rowsToCsv } from "@/lib/csv";

export function daysBetween(
  later: string | Date | null | undefined,
  earlier: string | Date | null | undefined
): number | null {
  if (!later || !earlier) return null;
  const a = new Date(later).getTime();
  const b = new Date(earlier).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function percentile90(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.ceil(sorted.length * 0.9) - 1;
  return sorted[Math.max(0, idx)]!;
}

export function csvResponse(
  filename: string,
  headers: string[],
  rows: unknown[][]
): Response {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${rowsToCsv(headers, rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${date}.csv"`,
    },
  });
}

export function toDbTier(tier: string | null): string | null {
  if (!tier) return null;
  if (tier.includes("_")) return tier;
  return tier.replace(/^tier(\d)$/, "tier_$1");
}

import { toDbStatus } from "@/lib/db-mappers";

export function toDbStatusFilter(status: string | null): string | null {
  if (!status) return null;
  return toDbStatus(status);
}

export function daysColorClass(days: number | null): string {
  if (days === null) return "text-slate-muted";
  if (days <= 1) return "text-emerald-600 font-medium";
  if (days <= 3) return "text-amber-600 font-medium";
  return "text-red-600 font-medium";
}
