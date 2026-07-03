/** Client-safe lead intake constants (no DB imports). */

import type { MakeupLookProfileInput } from "@/lib/makeup-look";

export const INTAKE_MIN_PROFILES = 4;
export const INTAKE_IDLE_DAYS = 7;
export const MAX_CONFIRMATION_NO_ANSWER_ATTEMPTS = 2;

export const LEAD_INTAKE_TASK_TYPES = [
  "bride_confirmation",
  "share_profiles",
  "lead_progress_follow_up",
] as const;

export type LeadConfirmationStatus = "pending" | "confirmed";

export type IntakeTaskTypeKey =
  | "brideConfirmation"
  | "shareProfiles"
  | "leadProgressFollowUp";

export const INTAKE_TASK_TYPE_KEYS: IntakeTaskTypeKey[] = [
  "brideConfirmation",
  "shareProfiles",
  "leadProgressFollowUp",
];

export function isIntakeTaskType(taskType: string): boolean {
  return (INTAKE_TASK_TYPE_KEYS as readonly string[]).includes(taskType);
}

export function isLeadRequirementsConfirmed(lead: {
  confirmationStatus?: LeadConfirmationStatus | null;
  requirementsConfirmedAt?: string | null;
}): boolean {
  if (lead.confirmationStatus === "confirmed") return true;
  return Boolean(lead.requirementsConfirmedAt);
}

export const BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE =
  "Complete the bride confirmation call task before pushing MUAs";

/** Push is allowed only after bride requirements are confirmed via the intake task. */
export function canPushMuaToLead(lead: {
  confirmationStatus?: LeadConfirmationStatus | null;
  requirementsConfirmedAt?: string | null;
}): boolean {
  return isLeadRequirementsConfirmed(lead);
}

export type NotInterestedIntakeMode = "commission" | "archive";

export type IntakeEventUpdate = {
  id: string;
  ceremonyType: string;
  eventDate: string | null;
  eventLocation: string | null;
  budgetAmount: number | null;
  description: string | null;
};

export type IntakeConfirmationDraft = {
  events: IntakeEventUpdate[];
  makeupLook: MakeupLookProfileInput | null;
};
