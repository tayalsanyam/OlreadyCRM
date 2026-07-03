/** Client-safe admin exit lead types (no DB imports). */

import type { ExitKind, ExitMarkedByRole } from "@/lib/lead-exit";
import type { LeadPhase } from "@/lib/lead-phase-shared";
import type { LeadStatus, Region, UploaderConfirmation } from "@/lib/types";

export type AdminExitLeadRow = {
  id: string;
  displayId: string;
  brideName: string;
  region: Region;
  status: LeadStatus;
  leadPhase: LeadPhase;
  eventDate: string;
  updatedAt: string;
  exitKind: ExitKind;
  exitMarkedByRole: ExitMarkedByRole | null;
  assignedRmName: string | null;
  hostileNote: string | null;
  handoverReason: string | null;
  uploaderConfirmation: UploaderConfirmation | null;
  portalOnly: boolean;
};

/** @deprecated use view + subFilter */
export type AdminExitBucket = "all" | "not_answering" | "not_interested" | "closed";

export type AdminExitCounts = {
  uploaderReview: number;
  notAnswering: number;
  notInterested: number;
  closed: number;
  total: number;
  bySource: Record<ExitMarkedByRole, number>;
};

export function adminExitNote(lead: Pick<AdminExitLeadRow, "hostileNote" | "handoverReason">): string | null {
  const hostile = lead.hostileNote?.trim();
  if (hostile) return hostile;
  const handover = lead.handoverReason?.trim();
  return handover || null;
}
