export type VerifiedRoutingFilter =
  | "all"
  | "regional_rm"
  | "commission"
  | "portal"
  | "rm_queue";

export const VERIFIED_ROUTING_FILTER_LABELS: Record<VerifiedRoutingFilter, string> = {
  all: "All routing",
  regional_rm: "Regional RM (assigned)",
  commission: "Commission",
  portal: "Portal",
  rm_queue: "Unassigned",
};

export function parseVerifiedRoutingFilter(raw: string | null): VerifiedRoutingFilter {
  if (raw === "unassigned") return "rm_queue";
  if (
    raw === "regional_rm" ||
    raw === "commission" ||
    raw === "portal" ||
    raw === "rm_queue"
  ) {
    return raw;
  }
  return "all";
}

export function parseOptionalDate(raw: string | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

/** Default true — hide expired leads on the verified tab unless excludeExpired=0. */
export function parseExcludeExpired(raw: string | null): boolean {
  if (raw === "0" || raw === "false") return false;
  return true;
}

/** Default true — hide booked leads on the verified tab unless excludeBooked=0. */
export function parseExcludeBooked(raw: string | null): boolean {
  if (raw === "0" || raw === "false") return false;
  return true;
}

/** SQL fragment for verified-tab routing filter (expects bride_leads alias `bl`). */
export function sqlVerifiedRoutingFilter(routing: VerifiedRoutingFilter): string {
  switch (routing) {
    case "regional_rm":
      return `bl.status = 'assigned' AND bl.assigned_rm_id IS NOT NULL`;
    case "commission":
      return `bl.status = 'commission_rm'`;
    case "portal":
      return `bl.portal_only = true AND bl.status = 'verified'`;
    case "rm_queue":
      return `bl.status = 'verified' AND bl.portal_only = false AND bl.assigned_rm_id IS NULL`;
    default:
      return "TRUE";
  }
}
