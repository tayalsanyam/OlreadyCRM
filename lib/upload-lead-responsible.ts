import type { LeadStatus } from "@/lib/types";
import { LEAD_STATUS_LABELS } from "@/lib/types";

export type UploadLeadResponsible = {
  label: string;
  detail: string | null;
  kind: "portal" | "commission" | "regional_rm" | "queue" | "other";
};

export function describeUploadLeadResponsible(lead: {
  status: LeadStatus;
  portalOnly?: boolean;
  assignedRmName?: string | null;
}): UploadLeadResponsible {
  if (lead.portalOnly && lead.status === "verified") {
    return {
      label: "Portal",
      detail: "Commission RM can browse and claim this lead",
      kind: "portal",
    };
  }
  if (lead.status === "commissionRm") {
    return {
      label: "Commission queue",
      detail: lead.assignedRmName ? `Touched by ${lead.assignedRmName}` : null,
      kind: "commission",
    };
  }
  if (lead.status === "assigned" && lead.assignedRmName) {
    return {
      label: lead.assignedRmName,
      detail: "Regional RM",
      kind: "regional_rm",
    };
  }
  if (lead.status === "verified" && !lead.portalOnly) {
    return {
      label: "Unassigned",
      detail: "Verified — waiting for a regional RM to be assigned",
      kind: "queue",
    };
  }
  if (lead.status === "booked" && lead.assignedRmName) {
    return {
      label: lead.assignedRmName,
      detail: "Regional RM (booked)",
      kind: "regional_rm",
    };
  }
  return {
    label: LEAD_STATUS_LABELS[lead.status] ?? lead.status,
    detail: lead.assignedRmName ?? null,
    kind: "other",
  };
}
