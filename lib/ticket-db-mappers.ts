import type {
  CareTaskPriority,
  CareTaskStatus,
  CareTaskType,
  RaisedByType,
  TicketSource,
  TicketStatus,
  TicketUrgency,
} from "@/lib/types";
import { fromDbTicketStatus, toDbTicketStatus } from "@/lib/ticket-status";

export { fromDbTicketStatus, toDbTicketStatus };

const URGENCY_TO_DB: Record<TicketUrgency, string> = {
  high: "high",
  medium: "medium",
  low: "low",
};

export function toDbTicketUrgency(urgency: TicketUrgency): string {
  return URGENCY_TO_DB[urgency];
}

export function fromDbTicketUrgency(urgency: string): TicketUrgency {
  return (urgency as TicketUrgency) ?? "medium";
}

const SOURCE_TO_DB: Record<TicketSource, string> = {
  publicForm: "public_form",
  manual: "manual",
  feedbackIntake: "feedback_intake",
  email: "email",
};

const SOURCE_FROM_DB = Object.fromEntries(
  Object.entries(SOURCE_TO_DB).map(([k, v]) => [v, k])
) as Record<string, TicketSource>;

export function toDbTicketSource(source: TicketSource): string {
  return SOURCE_TO_DB[source];
}

export function fromDbTicketSource(source: string): TicketSource {
  return SOURCE_FROM_DB[source] ?? "manual";
}

const RAISED_BY_TO_DB: Record<RaisedByType, string> = {
  mua: "mua",
  bride: "bride",
  other: "other",
};

export function toDbRaisedByType(type: RaisedByType): string {
  return RAISED_BY_TO_DB[type];
}

export function fromDbRaisedByType(type: string): RaisedByType {
  return (type as RaisedByType) ?? "mua";
}

const CARE_TASK_TYPE_TO_DB: Record<CareTaskType, string> = {
  callBack: "call_back",
  gatherData: "gather_data",
  verifyLead: "verify_lead",
  attachProof: "attach_proof",
  attachLedger: "attach_ledger",
  attachContract: "attach_contract",
  rmInput: "rm_input",
  salesInput: "sales_input",
  rmMuaResolution: "rm_mua_resolution",
  draftResponse: "draft_response",
  adminReview: "admin_review",
  sendEmail: "send_email",
};

const CARE_TASK_TYPE_FROM_DB = Object.fromEntries(
  Object.entries(CARE_TASK_TYPE_TO_DB).map(([k, v]) => [v, k])
) as Record<string, CareTaskType>;

export function toDbCareTaskType(type: CareTaskType): string {
  return CARE_TASK_TYPE_TO_DB[type];
}

export function fromDbCareTaskType(type: string): CareTaskType {
  return CARE_TASK_TYPE_FROM_DB[type] ?? "gatherData";
}

const TASK_PRIORITY_TO_DB: Record<CareTaskPriority, string> = {
  critical: "critical",
  high: "high",
  normal: "normal",
  low: "low",
};

export function toDbTaskPriority(priority: CareTaskPriority): string {
  return TASK_PRIORITY_TO_DB[priority];
}

export function fromDbTaskPriority(priority: string): CareTaskPriority {
  return (priority as CareTaskPriority) ?? "normal";
}

const TASK_STATUS_TO_DB: Record<CareTaskStatus, string> = {
  pending: "pending",
  inProgress: "in_progress",
  done: "done",
  cancelled: "cancelled",
};

const TASK_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(TASK_STATUS_TO_DB).map(([k, v]) => [v, k])
) as Record<string, CareTaskStatus>;

export function toDbCareTaskStatus(status: CareTaskStatus): string {
  return TASK_STATUS_TO_DB[status];
}

export function fromDbCareTaskStatus(status: string): CareTaskStatus {
  return TASK_STATUS_FROM_DB[status] ?? "pending";
}
