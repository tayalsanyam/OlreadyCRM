import { fromDbStatus } from "@/lib/db-mappers";

/** Client-safe: whether this lead uses per-booking MUA commission tracking. */
export function leadTracksCommissionSync(lead: {
  shiftedAt?: string | null;
  status: string;
}): boolean {
  if (lead.shiftedAt) return true;
  const status = lead.status.includes("_")
    ? fromDbStatus(lead.status)
    : lead.status;
  return status === "commissionRm";
}
