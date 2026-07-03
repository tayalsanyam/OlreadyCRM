import type {
  BudgetTier,
  CommEntryType,
  LeadConfirmationStatus,
  LeadFull,
  LeadStatus,
  MuaPushStage,
  MuaPushStatus,
  PlanTier,
  PushOutcome,
  TaskType,
  UrgencyBand,
  UserRole,
} from "@/lib/types";
import { coerceStringArray } from "@/lib/utils";

export function toDbTier(tier: BudgetTier): string {
  const map: Record<BudgetTier, string> = {
    tier1: "tier_1",
    tier2: "tier_2",
    tier3: "tier_3",
    tier4: "tier_4",
  };
  return map[tier] ?? "tier_3";
}

export function fromDbTier(t: string): BudgetTier {
  if (t.startsWith("tier_")) return `tier${t.slice(5)}` as BudgetTier;
  return t as BudgetTier;
}

export function fromDbStatus(s: string): LeadStatus {
  if (s === "commission_rm") return "commissionRm";
  if (s === "pending_verification") return "pendingVerification";
  return s as LeadStatus;
}

/** Map app/API status to Postgres lead_status enum value. */
export function toDbStatus(status: string): string {
  if (status === "commissionRm" || status === "commission_rm") return "commission_rm";
  if (status === "pendingVerification" || status === "pending_verification")
    return "pending_verification";
  return status;
}

export function fromDbUrgencyBand(b: string): UrgencyBand {
  if (b === "long_shelf") return "longShelf";
  return b as UrgencyBand;
}

const PUSH_STAGE_TO_DB: Record<MuaPushStage, string> = {
  initialContact: "initial_contact",
  offerSent: "offer_sent",
  followUpDone: "follow_up_done",
  negotiating: "negotiating",
  brideSelected: "bride_selected",
};

export function toDbPushStage(stage: string): string {
  return PUSH_STAGE_TO_DB[stage as MuaPushStage] ?? stage;
}

export function fromDbPushStage(stage: string): MuaPushStage {
  const map: Record<string, MuaPushStage> = {
    initial_contact: "initialContact",
    offer_sent: "offerSent",
    follow_up_done: "followUpDone",
    negotiating: "negotiating",
    bride_selected: "brideSelected",
  };
  return map[stage] ?? (stage as MuaPushStage);
}

export function toDbPushOutcome(outcome: string | undefined | null): string | null {
  if (outcome == null || outcome === "") return null;
  if (outcome === "notSelected") return "not_selected";
  if (outcome === "notInterested") return "not_interested";
  const key = outcome.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "notselected" || key === "not_selected") return "not_selected";
  if (key === "notinterested" || key === "not_interested") return "not_interested";
  if (key === "withdrew") return "withdrew";
  return null;
}

export function fromDbPushOutcome(outcome: string): PushOutcome {
  const map: Record<string, PushOutcome> = {
    not_selected: "notSelected",
    not_interested: "notInterested",
    withdrew: "withdrew",
    notSelected: "notSelected",
    notInterested: "notInterested",
  };
  return map[outcome] ?? (outcome as PushOutcome);
}

export function fromDbPushStatus(status: string): MuaPushStatus {
  const map: Record<string, MuaPushStatus> = {
    awaiting_close: "awaitingClose",
  };
  return map[status] ?? (status as MuaPushStatus);
}

export function fromDbTaskType(type: string): TaskType {
  const map: Record<string, TaskType> = {
    follow_up: "followUp",
    close_conversation: "closeConversation",
    admin_review: "adminReview",
    shift_warning: "shiftWarning",
    collect_mua_prospect: "collectMuaProspect",
    feedback_follow_up: "feedbackFollowUp",
    feedback_referral_follow_up: "feedbackReferralFollowUp",
    sales_follow_up: "salesFollowUp",
    sales_senior_call: "salesSeniorCall",
    sales_onboarding: "salesOnboarding",
    sales_activation: "salesActivation",
    sales_assign_rm: "salesAssignRm",
    bride_confirmation: "brideConfirmation",
    share_profiles: "shareProfiles",
    lead_progress_follow_up: "leadProgressFollowUp",
  };
  return map[type] ?? (type as TaskType);
}

export function toDbTaskType(type: TaskType): string {
  const map: Record<TaskType, string> = {
    followUp: "follow_up",
    closeConversation: "close_conversation",
    adminReview: "admin_review",
    shiftWarning: "shift_warning",
    collectMuaProspect: "collect_mua_prospect",
    feedbackFollowUp: "feedback_follow_up",
    feedbackReferralFollowUp: "feedback_referral_follow_up",
    salesFollowUp: "sales_follow_up",
    salesSeniorCall: "sales_senior_call",
    salesOnboarding: "sales_onboarding",
    salesActivation: "sales_activation",
    salesAssignRm: "sales_assign_rm",
    brideConfirmation: "bride_confirmation",
    shareProfiles: "share_profiles",
    leadProgressFollowUp: "lead_progress_follow_up",
  };
  return map[type] ?? type;
}

export function fromDbPlanTier(tier: string | null): PlanTier | null {
  if (!tier) return null;
  const map: Record<string, PlanTier> = {
    highest_privy: "highestPrivy",
    phoenix_2: "phoenix2",
    phoenix: "phoenix",
    pro: "pro",
    prime: "prime",
  };
  return map[tier] ?? (tier as PlanTier);
}

export function toDbPlanTier(tier: PlanTier | string | null): string | null {
  if (!tier) return null;
  const map: Record<string, string> = {
    highestPrivy: "highest_privy",
    phoenix2: "phoenix_2",
    phoenix: "phoenix",
    pro: "pro",
    prime: "prime",
    highest_privy: "highest_privy",
    phoenix_2: "phoenix_2",
  };
  return map[tier] ?? tier;
}

/** Map a MUA row from Postgres plan_tier enum to app PlanTier. */
export function normalizeMua<T extends { planTier?: string | null }>(
  row: T
): Omit<T, "planTier"> & { planTier: PlanTier | null } {
  return {
    ...row,
    planTier: fromDbPlanTier(row.planTier ?? null),
  };
}

const COMM_TYPE_TO_DB: Record<CommEntryType, string> = {
  leadCreated: "lead_created",
  leadVerified: "lead_verified",
  assigned: "assigned",
  muaPushed: "mua_pushed",
  stageUpdated: "stage_updated",
  capBypass: "cap_bypass",
  callLogged: "call_logged",
  whatsappLogged: "whatsapp_logged",
  shiftedCommission: "shifted_commission",
  hostileFlagged: "hostile_flagged",
  closeConfirmation: "close_confirmation",
  conversationClosed: "conversation_closed",
  bookingConfirmed: "booking_confirmed",
  softCheckin: "soft_checkin",
  note: "note",
  callyzerSynced: "callyzer_synced",
  careTicketCreated: "care_ticket_created",
  careEmailSent: "care_email_sent",
  careCallbackLogged: "care_callback_logged",
  careTaskCompleted: "care_task_completed",
  careWhatsappLogged: "care_whatsapp_logged",
  careEscalation: "care_escalation",
};

const COMM_DB_TO_APP = Object.fromEntries(
  Object.entries(COMM_TYPE_TO_DB).map(([k, v]) => [v, k])
) as Record<string, CommEntryType>;

export function toDbCommEntryType(type: CommEntryType | string): string {
  return COMM_TYPE_TO_DB[type as CommEntryType] ?? type;
}

export function fromDbCommEntryType(type: string): CommEntryType {
  return COMM_DB_TO_APP[type] ?? (type as CommEntryType);
}

export function fromDbRole(role: string): UserRole {
  const map: Record<string, UserRole> = {
    regional_rm: "regionalRm",
    commission_rm: "commissionRm",
    lead_uploader: "leadUploader",
    feedback_rm: "feedbackRm",
    care_agent: "careAgent",
    sales_rm: "salesRm",
    sales_tl: "salesTl",
    sales_activation: "salesActivation",
    admin: "admin",
    owner: "owner",
  };
  return map[role] ?? "regionalRm";
}

/** Normalize a leads_full (or similar) row from Postgres enums to app types. */
export function normalizeCommEntry<
  T extends {
    entryType: string;
    actorRole?: string | null;
  },
>(row: T): T & { entryType: CommEntryType; actorRole?: UserRole | null } {
  return {
    ...row,
    entryType: fromDbCommEntryType(String(row.entryType)),
    actorRole: row.actorRole
      ? fromDbRole(String(row.actorRole))
      : (row.actorRole as UserRole | null | undefined),
  };
}

export function normalizeMuaPush<
  T extends {
    stage: string;
    status?: string;
    planTier?: string | null;
    outcome?: string | null;
    eventIds?: unknown;
    eventLabels?: unknown;
  },
>(
  row: T
): T & {
  stage: MuaPushStage;
  status?: MuaPushStatus;
  planTier?: PlanTier | null;
  outcome?: PushOutcome | null;
  eventIds: string[];
  eventLabels: string[];
} {
  return {
    ...row,
    stage: fromDbPushStage(String(row.stage)),
    eventIds: coerceStringArray(row.eventIds),
    eventLabels: coerceStringArray(row.eventLabels),
    ...(row.status != null && {
      status: fromDbPushStatus(String(row.status)),
    }),
    ...(row.outcome != null && {
      outcome: fromDbPushOutcome(String(row.outcome)),
    }),
    ...(row.planTier !== undefined && {
      planTier: fromDbPlanTier(row.planTier ?? null),
    }),
  };
}

export function fromDbConfirmationStatus(
  row: {
    confirmationStatus?: LeadConfirmationStatus | string | null;
    confirmation_status?: LeadConfirmationStatus | string | null;
    requirementsConfirmedAt?: string | null;
    requirements_confirmed_at?: string | null;
  }
): LeadConfirmationStatus {
  const raw = row.confirmationStatus ?? row.confirmation_status;
  if (raw === "confirmed" || raw === "pending") return raw;
  if (row.requirementsConfirmedAt ?? row.requirements_confirmed_at) return "confirmed";
  return "pending";
}

export function normalizeLeadFull(row: LeadFull): LeadFull {
  const r = row as LeadFull & {
    shifted_at?: string | null;
    owner_assigned_at?: string | null;
  };
  return {
    ...r,
    shiftedAt: r.shiftedAt ?? r.shifted_at ?? null,
    ownerAssignedAt: r.ownerAssignedAt ?? r.owner_assigned_at ?? null,
    budgetTier: fromDbTier(String(r.budgetTier ?? "tier_3")),
    status: fromDbStatus(String(r.status ?? "assigned")),
    urgencyBand: fromDbUrgencyBand(String(r.urgencyBand ?? "active")),
    muasOfferedCount: Number(r.muasOfferedCount ?? r.activePushesCount ?? 0),
    muasOfferedNames: r.muasOfferedNames ?? null,
    bookedEventCount: Number(r.bookedEventCount ?? 0),
    openEventCount: Number(r.openEventCount ?? 0),
    eventLabels: r.eventLabels ?? null,
    commissionOffered:
      r.commissionOffered != null ? Number(r.commissionOffered) : null,
    commissionAgreed:
      r.commissionAgreed != null ? Number(r.commissionAgreed) : null,
    activePushStages: coerceStringArray(
      (r as { activePushStages?: unknown; active_push_stages?: unknown })
        .activePushStages ??
        (r as { active_push_stages?: unknown }).active_push_stages
    ),
    confirmationStatus: fromDbConfirmationStatus(
      r as {
        confirmationStatus?: LeadConfirmationStatus;
        confirmation_status?: LeadConfirmationStatus;
        requirementsConfirmedAt?: string | null;
        requirements_confirmed_at?: string | null;
      }
    ),
    confirmationAttempts: Number(
      (r as { confirmationAttempts?: number; confirmation_attempts?: number })
        .confirmationAttempts ??
        (r as { confirmation_attempts?: number }).confirmation_attempts ??
        0
    ),
    requirementsConfirmedAt:
      (r as { requirementsConfirmedAt?: string | null; requirements_confirmed_at?: string | null })
        .requirementsConfirmedAt ??
      (r as { requirements_confirmed_at?: string | null }).requirements_confirmed_at ??
      null,
  };
}
