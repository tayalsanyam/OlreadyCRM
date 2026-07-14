import type { TicketStatus } from "@/lib/types";
import {
  TICKET_STATUS_ORDER,
  ticketStatusLabel,
  ticketStatusesForParty,
} from "@/lib/ticket-status";
import { isGrievanceOperator } from "@/lib/ticket-access";

const RM_COMPLETE_ADVANCE: Partial<Record<string, TicketStatus[]>> = {
  rm_input: ["investigating", "inDiscussion"],
  rm_mua_resolution: ["investigating", "inDiscussion"],
  sales_input: ["investigating", "inDiscussion"],
  gather_data: ["investigating", "awaitingInfo"],
  call_back: ["investigating", "awaitingInfo", "inDiscussion"],
  attach_proof: ["investigating"],
  verify_lead: ["investigating"],
};

function dbTaskTypeKey(taskType: string): string {
  return taskType.includes("_") ? taskType : taskType.replace(/([A-Z])/g, "_$1").toLowerCase();
}

/** Optional suggestion only — stage changes are manual. */
export function suggestedTicketStatusOnComplete(
  taskType: string,
  currentStatus: TicketStatus
): TicketStatus | null {
  const key = dbTaskTypeKey(taskType);
  if (key === "gather_data" && currentStatus === "received") return "investigating";
  if (key === "send_email") return "closed";
  return null;
}

export function allowedTicketStatusesOnComplete(
  role: string,
  taskType: string,
  currentStatus: TicketStatus,
  raisedByType = "mua"
): TicketStatus[] {
  const key = dbTaskTypeKey(taskType);
  const partyStages = ticketStatusesForParty(raisedByType);
  const idx = partyStages.indexOf(currentStatus);

  if (isGrievanceOperator(role)) {
    const extras = RM_COMPLETE_ADVANCE[key] ?? [];
    if (key === "draft_response" || key === "admin_review" || key === "send_email") {
      return partyStages.filter((s) => s === "closed" || partyStages.indexOf(s) >= idx);
    }
    const forward = partyStages.filter((s, i) => i > idx);
    const merged = new Set<TicketStatus>([...extras, ...forward, "closed"]);
    merged.delete(currentStatus);
    return partyStages.filter((s) => merged.has(s));
  }

  const allowed = RM_COMPLETE_ADVANCE[key] ?? ["investigating"];
  return allowed.filter((s) => partyStages.includes(s) && partyStages.indexOf(s) >= idx);
}

export function ticketStatusOptionLabel(
  status: TicketStatus,
  raisedByType?: string
): string {
  return ticketStatusLabel(status, raisedByType);
}

export function allTicketStatusOptions(raisedByType = "mua") {
  return ticketStatusesForParty(raisedByType).map((s) => ({
    value: s,
    label: ticketStatusLabel(s, raisedByType),
  }));
}

export { TICKET_STATUS_ORDER };
