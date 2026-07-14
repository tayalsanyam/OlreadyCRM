import type { MuaServiceOffering } from "@/lib/mua-service-catalog";

export type UserRole =
  | "regionalRm"
  | "commissionRm"
  | "leadUploader"
  | "feedbackRm"
  | "careAgent"
  | "salesRm"
  | "salesTl"
  | "salesActivation"
  | "admin"
  | "owner";

export type Region = "north" | "east" | "west" | "south";

export type BudgetTier = "tier1" | "tier2" | "tier3" | "tier4";

export type LeadStatus =
  | "pendingVerification"
  | "verified"
  | "assigned"
  | "commissionRm"
  | "booked"
  | "archived"
  | "missed"
  | "expired";

export type UrgencyBand = "critical" | "hot" | "active" | "longShelf";

export type PlanTier =
  | "highestPrivy"
  | "phoenix2"
  | "phoenix"
  | "pro"
  | "prime";

export type MuaPushStage =
  | "initialContact"
  | "offerSent"
  | "followUpDone"
  | "negotiating"
  | "brideSelected";

export type MuaPushStatus = "active" | "closed" | "booked" | "awaitingClose";

export type PushOutcome = "notSelected" | "withdrew" | "notInterested";

export type EventStatus = "open" | "booked" | "notNeeded";

export type CommEntryType =
  | "leadCreated"
  | "leadVerified"
  | "assigned"
  | "muaPushed"
  | "stageUpdated"
  | "capBypass"
  | "callLogged"
  | "whatsappLogged"
  | "shiftedCommission"
  | "hostileFlagged"
  | "closeConfirmation"
  | "conversationClosed"
  | "bookingConfirmed"
  | "softCheckin"
  | "note"
  | "callyzerSynced"
  | "careTicketCreated"
  | "careEmailSent"
  | "careCallbackLogged"
  | "careTaskCompleted"
  | "careWhatsappLogged"
  | "careEscalation";

export type TaskType =
  | "closeConversation"
  | "followUp"
  | "adminReview"
  | "shiftWarning"
  | "collectMuaProspect"
  | "feedbackFollowUp"
  | "feedbackReferralFollowUp"
  | "salesFollowUp"
  | "salesSeniorCall"
  | "salesOnboarding"
  | "salesActivation"
  | "salesAssignRm"
  | "brideConfirmation"
  | "shareProfiles"
  | "leadProgressFollowUp";

export type LeadConfirmationStatus = "pending" | "confirmed";
export type BrideConfirmationOutcome = "confirmed" | "no_answer" | "not_interested";

export type PipelineStage =
  | "Untouched"
  | "Not Connected"
  | "Call Back"
  | "Follow Up"
  | "Details Shared"
  | "Demo Scheduled"
  | "Demo Done"
  | "Senior Call"
  | "Senior Call Done"
  | "Confirm"
  | "Part Payment"
  | "Onboarding"
  | "Deal Closed"
  | "Rejected";

export type SalesMuaStatus = "active" | "inactive";
export type MuaSource = "Inbound" | "Ads" | "Referral" | "Instagram DM" | "Others";
export type MuaType = "candidate" | "renewal" | "re_engage";
export type SalesPaymentMode = "UPI" | "Cash" | "Bank Transfer" | "Card" | "Other";
export type LastLeadContact = {
  at: string;
  direction: "inbound" | "outbound" | null;
  durationSec: number | null;
  actorName: string | null;
  source: "callyzer" | "manual" | "whatsapp";
  channel: "call" | "whatsapp";
};

export type SalesCommsEntryType =
  | "callLogged"
  | "whatsappLogged"
  | "emailLogged"
  | "stageChanged"
  | "noteAdded"
  | "onboardingUpdated"
  | "trainingUpdated"
  | "activationUpdated"
  | "callyzerSynced";

export type FeedbackServiceSentiment = "positive" | "negative" | "mixed";

export type FeedbackEngageAgain = "yes" | "no" | "maybe";

export type FeedbackReferralStatus =
  | "pending"
  | "picked_up"
  | "converted"
  | "dismissed";

export type FeedbackConnectionStatus =
  | "connected"
  | "not_answered"
  | "not_interested"
  | "closed_no_contact";

export type FeedbackMuaType = "olready" | "non_olready";

export type MuaProspectStatus = "pending" | "collected" | "closed";

/** Lead uploader outcome after reviewing a not-interested lead. */
export type UploaderConfirmation = "confirmed_ni" | "rm_error" | "reopen";

export type TaskStatus = "pending" | "done" | "cancelled";

export type TaskCloseOutcome =
  | "booked"
  | "notSelected"
  | "withdrew"
  | "notInterested";

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  name: string;
  role: UserRole;
  region: Region | null;
  regions?: Region[];
  teamId?: string | null;
  callyzerNumber?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  tier: PlanTier;
  name: string;
  weeklyCap: number;
  monthlyPushTarget?: number | null;
  assuredBookings?: number | null;
  listPriceInr?: number | null;
  planSummary?: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SlaConfig {
  id: number;
  perLeadCap: number;
  assignmentWindowDays: number;
  shiftWarningDay: number;
  inactivityThresholdHours: number;
  capBypassDays: number;
  criticalMaxDays: number;
  hotMaxDays: number;
  activeMaxDays: number;
  ceremonyTypes: string[];
  autoAssignEnabled?: boolean;
  autoAssignBy?: string;
  budgetTierRanges?: Partial<Record<BudgetTier, string>>;
  /** INR min/max per tier; tier is auto-set from sum of ceremony budgets at verification. */
  budgetTierLimits?: Partial<
    Record<BudgetTier, { min: number; max: number | null }>
  >;
  leadSources?: string[];
  whatsappConfig?: import("@/lib/whatsapp/config").WhatsAppConfig;
  updatedAt: string;
}

export interface BrideLead {
  id: string;
  displayId: string;
  brideName: string;
  phone: string;
  email: string | null;
  city: string;
  region: Region | null;
  eventLocation: string | null;
  eventDate: string;
  budgetAmount: number | null;
  budgetTier: BudgetTier;
  source: string | null;
  status: LeadStatus;
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  assignedRmId: string | null;
  assignmentDate: string | null;
  shiftedAt: string | null;
  ownerAssignedAt?: string | null;
  handoverReason: string | null;
  groupSize: number | null;
  groupNotes: string | null;
  hostileNote: string | null;
  verificationConnectAttempts?: number;
  lastVerificationConnectAt?: string | null;
  confirmationStatus?: LeadConfirmationStatus;
  confirmationAttempts?: number;
  requirementsConfirmedAt?: string | null;
  uploaderConfirmedAt?: string | null;
  uploaderConfirmedBy?: string | null;
  uploaderConfirmation?: UploaderConfirmation | null;
  exitMarkedByRole?: string | null;
  commissionOffered?: number | null;
  commissionAgreed?: number | null;
  portalPushed?: boolean;
  portalPushedAt?: string | null;
  portalCap?: number | null;
  portalOnly?: boolean;
  expiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadFull extends BrideLead {
  urgencyBand: UrgencyBand;
  daysToEvent: number;
  assignmentDaysRemaining: number | null;
  daysSinceAssignment: number | null;
  assignedRmName: string | null;
  activePushesCount: number;
  muasOfferedCount: number;
  muasOfferedNames: string | null;
  eventCount: number;
  bookedEventCount: number;
  openEventCount: number;
  eventLabels: string | null;
  lastActivityAt: string | null;
  /** Active push stages (DB snake_case values) for queue stage filter */
  activePushStages?: string[];
}

export interface LeadEvent {
  id: string;
  leadId: string;
  ceremonyType: string;
  eventDate: string | null;
  eventLocation?: string | null;
  region?: Region | null;
  status: EventStatus;
  muaId: string | null;
  bookedPrice: number | null;
  budgetAmount?: number | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Mua {
  id: string;
  displayId: string;
  name: string;
  phone?: string | null;
  city: string;
  /** @deprecated use regions */
  region?: Region | null;
  regions?: Region[];
  bio?: string | null;
  services?: string[];
  serviceOfferings?: MuaServiceOffering[];
  businessName?: string | null;
  officialAddress?: string | null;
  gstNumber?: string | null;
  email?: string | null;
  alternatePhone?: string | null;
  businessManagerPhone?: string | null;
  avgRevenueTarget?: number | null;
  preferredContactChannel?: string | null;
  source?: string | null;
  planTier: PlanTier | null;
  planExpiry: string | null;
  status: string;
  whatsapp?: string | null;
  instagram?: string | null;
  specialties?: string[];
  assignedRmId?: string | null;
  planRmId?: string | null;
  joinDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MuaSalesCallSummary {
  totalCalls: number;
  callyzerCalls: number;
  lastCallAt: string | null;
  lastCallOutcome: string | null;
}

export interface MuaDetailProfile extends Mua {
  regions: Region[];
  weeklyCap: number;
  monthlyPushTarget: number | null;
  assuredBookings?: number | null;
  planTierName: string | null;
  assignedRmName: string | null;
  planRmName: string | null;
  totalPushes: number;
  activePushes: number;
  totalBookings: number;
  formalBookings?: number;
  feedbackBookings?: number;
  totalBookingRevenue?: number;
  weeklyUsed: number;
  conversionPct: number;
  salesCallSummary?: MuaSalesCallSummary | null;
}

export interface MuaPushLeadRow {
  id: string;
  stage: MuaPushStage;
  status: MuaPushStatus;
  createdAt: string;
  updatedAt: string;
  leadId: string;
  displayId: string;
  brideName: string;
  budgetTier: BudgetTier;
  urgencyBand: UrgencyBand;
  eventDate: string;
  rmName: string | null;
}

export interface MuaPlanHistoryRow {
  id: string;
  muaId: string;
  planTier: PlanTier | null;
  assignedBy: string | null;
  assignedAt: string;
  expiryAt: string | null;
  notes: string | null;
  assignedByName: string | null;
  /** Matches live plan on the MUA roster (tier + expiry). */
  isCurrent?: boolean;
  /** Derived display status for timeline UI. */
  planStatus?: "current" | "expired" | "past";
}

export type PipelineHealthBucket = "none" | "1-5" | "6-10" | "11-15" | "16+";

export interface PipelineHealthLead extends LeadFull {
  muasOfferedCount: number;
  bucket: PipelineHealthBucket;
}

export type DateRangeFilterValue = {
  mode: "all" | "preset" | "range";
  preset?: "nextMonth" | "thisQuarter" | "nextQuarter";
  from?: string;
  to?: string;
};

export interface MuaPush {
  id: string;
  leadId: string;
  muaId: string;
  stage: MuaPushStage;
  status: MuaPushStatus;
  outcome: PushOutcome | null;
  quotedTotal: number | null;
  eventIds: string[];
  bypassReason: string | null;
  pushedBy: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MuaPushEventPrice {
  id: string;
  pushId: string;
  eventId: string;
  quotedPrice: number;
}

export interface RmMuaRosterItem {
  id: string;
  displayId: string;
  name: string;
  city: string;
  planTier: PlanTier | null;
  planExpiry: string | null;
  weeklyCap: number;
  monthlyPushTarget?: number | null;
  assuredBookings?: number | null;
  weeklyUsed: number;
  weeklyRemaining: number;
  activeConversations: number;
  awaitingClose: number;
  totalBookings: number;
  totalPushesAllTime: number;
  lastPushed: string | null;
}

export interface MuaPushWithDetails extends MuaPush {
  muaName: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  muaCity?: string | null;
  planTier: PlanTier | null;
  eventLabels: string[];
  daysSincePush: number;
  weeklyPushesUsed?: number;
  weeklyCap?: number;
}

export type PaymentMode = "upi" | "cash" | "bank_transfer" | "card" | "other";

export interface Booking {
  id: string;
  leadId: string;
  eventId: string;
  muaId: string;
  pushId: string | null;
  bookedPrice: number;
  bookingDate: string;
  advancePaid: number | null;
  fullPaid: number | null;
  paymentMode: PaymentMode | null;
  zohoInvoiceRef: string | null;
  commissionAmount: number | null;
  commissionPaid: number | null;
  commissionPaidAt: string | null;
  commissionPaymentMode: PaymentMode | null;
  brideFullyPaidAt: string | null;
  commissionNextFollowUpAt?: string | null;
  createdBy: string;
  createdAt: string;
  cancelled?: boolean;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export interface BookingRow {
  id: string;
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
  paymentMode: PaymentMode | null;
  bookingDate: string;
  zohoInvoiceRef: string | null;
  trackCommission: boolean;
  commissionAmount: number | null;
  commissionPaid: number | null;
  commissionPaidAt: string | null;
  commissionPaymentMode: PaymentMode | null;
  brideFullyPaidAt: string | null;
  commissionNextFollowUpAt: string | null;
  commissionOverdue: boolean;
  leadId: string;
  displayId: string;
  brideName: string;
  city: string;
  region: Region;
  budgetTier: BudgetTier;
  ceremonyType: string;
  eventDate: string | null;
  muaId: string;
  muaName: string;
  muaPlan: PlanTier | null;
  rmName: string | null;
  pushStage: string | null;
  cancelled?: boolean;
  cancelReason?: string | null;
}

export interface LeadFeedback {
  id: string;
  leadId: string;
  eventId: string | null;
  muaType: FeedbackMuaType;
  olreadyMuaId: string | null;
  nonOlreadyMuaName: string | null;
  valuableOptions: boolean | null;
  referencesNote: string | null;
  improvementsNote: string | null;
  connectionStatus: FeedbackConnectionStatus;
  serviceSentiment: FeedbackServiceSentiment | null;
  negativeReasons: string[];
  negativeReasonOther: string | null;
  recommendationsNote: string | null;
  referralsNote: string | null;
  olreadyServiceNote: string | null;
  muaServiceNote: string | null;
  engageAgain: FeedbackEngageAgain | null;
  engageAgainNote: string | null;
  followUpRequested: boolean;
  followUpAt: string | null;
  followUpNote: string | null;
  olreadyRating: number | null;
  muaRating: number | null;
  submittedBy: string | null;
  createdAt: string;
}

export interface FeedbackReferral {
  id: string;
  sourceLeadId: string;
  feedbackId: string | null;
  referralName: string;
  referralPhone: string | null;
  captureType?: "structured" | "note";
  capturedBy: string;
  status: FeedbackReferralStatus;
  convertedLeadId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  sourceBrideName?: string;
  sourceDisplayId?: string;
  capturedByName?: string;
}

export interface MuaProspect {
  id: string;
  leadId: string | null;
  nonOlreadyMuaName: string;
  instaId: string | null;
  phone: string | null;
  city: string | null;
  taskId: string | null;
  status: MuaProspectStatus;
  createdAt: string;
  brideName?: string;
  displayId?: string;
  taskStatus?: TaskStatus | null;
}

export interface CommEntry {
  id: string;
  leadId: string;
  muaId?: string | null;
  entryType: CommEntryType;
  description: string;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName?: string;
  actorRole?: UserRole;
}

export interface AuditEntry {
  id: string;
  tableName: string;
  recordId: string;
  action: string;
  actorId: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export interface Task {
  id: string;
  displayId: string;
  userId: string;
  staffId?: string;
  leadId: string | null;
  pushId: string | null;
  taskType: TaskType;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  leadName?: string;
  brideDisplayId?: string;
  muaName?: string;
  pushStage?: MuaPushStage | null;
  /** Set when task title references [PIPE:uuid] (sales CRM tasks). */
  salesPipelineId?: string | null;
  salesPipelineStage?: PipelineStage | null;
  salesPipelineMuaName?: string | null;
  salesPipelineMuaCity?: string | null;
  salesPipelineMuaType?: string | null;
  salesPipelineMuaPhone?: string | null;
  salesPipelineMuaWhatsapp?: string | null;
  salesTrainingComplete?: boolean | null;
  activationSentBack?: boolean | null;
  activationSentBackNote?: string | null;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  muaCity?: string | null;
  leadPhone?: string | null;
  muaId?: string | null;
  /** Friends/family note when task is feedbackReferralFollowUp */
  referralIntakeNote?: string | null;
  /** Active distinct MUAs pushed (intake progress) */
  activeDistinctMuas?: number;
  confirmationStatus?: LeadConfirmationStatus | null;
  /** Lead summary for task list (queue-style context) */
  leadCity?: string | null;
  leadRegion?: Region | null;
  eventDate?: string | null;
  daysToEvent?: number | null;
  urgencyBand?: UrgencyBand | null;
  budgetAmount?: number | null;
  budgetTier?: BudgetTier | null;
  leadStatus?: LeadStatus | null;
  eventLabels?: string | null;
  lastActivityAt?: string | null;
  activePushesCount?: number;
  muasOfferedCount?: number;
  muasOfferedNames?: string | null;
  bookedEventCount?: number;
  openEventCount?: number;
}

export interface SalesPipeline {
  id: string;
  muaId: string;
  muaName: string;
  muaPhone: string | null;
  muaCity: string;
  muaSource: MuaSource | null;
  muaType: MuaType;
  stage: PipelineStage;
  priorityTag?: "hot" | "follow_up" | "nurturing" | "cold" | null;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  salesClosedBy: string | null;
  salesClosedByName: string | null;
  teamId: string | null;
  dealAmount: number | null;
  dealDate: string | null;
  createdAt: string;
  updatedAt: string;
  daysInStage: number;
  daysSinceLastContact: number | null;
  lastCalledAt?: string | null;
  lastCallOutcome?: string | null;
  callAttemptsThisWeek?: number;
  totalRepeatedNoAnswer?: number;
}

export interface StageLog {
  id: string;
  pipelineId: string;
  fromStage: string | null;
  toStage: string;
  changedBy: string;
  changedByName: string | null;
  note: string | null;
  nextTouchPoint: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SalesCommsEntry {
  id: string;
  pipelineId: string;
  entryType: SalesCommsEntryType;
  description: string;
  actorId: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SalesTeam {
  id: string;
  name: string;
  tlId: string;
  tlName: string | null;
  memberCount: number;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface SessionUser {
  userId: string;
  role: UserRole;
  name: string;
  region: Region | null;
  regions?: Region[];
}

export const ROLE_HOME: Record<UserRole, string> = {
  regionalRm: "/rm/queue",
  commissionRm: "/commission/queue",
  leadUploader: "/upload/leads",
  feedbackRm: "/feedback/queue",
  careAgent: "/care/grievances",
  salesRm: "/sales/pipeline",
  salesTl: "/sales/pipeline",
  salesActivation: "/activation/queue",
  admin: "/admin/dashboard",
  owner: "/owner/analytics",
};

export type TicketStatus =
  | "received"
  | "investigating"
  | "awaitingInfo"
  | "initialReplySent"
  | "inDiscussion"
  | "finalOffer"
  | "resolutionProposed"
  | "closed";

export type TicketUrgency = "high" | "medium" | "low";

export type CareTaskPriority = "critical" | "high" | "normal" | "low";

export type CareTaskType =
  | "callBack"
  | "gatherData"
  | "verifyLead"
  | "attachProof"
  | "attachLedger"
  | "attachContract"
  | "rmInput"
  | "salesInput"
  | "rmMuaResolution"
  | "draftResponse"
  | "adminReview"
  | "sendEmail";

export type CareTaskStatus = "pending" | "inProgress" | "done" | "cancelled";

export type TicketSource = "publicForm" | "manual" | "feedbackIntake" | "email";

export type RaisedByType = "mua" | "bride" | "other";

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  muaId: string | null;
  muaName?: string | null;
  leadId: string | null;
  brideName?: string | null;
  leadDisplayId?: string | null;
  category: string;
  subcategory: string | null;
  status: TicketStatus;
  urgency: TicketUrgency;
  source: TicketSource;
  raisedByType: RaisedByType;
  raisedByName: string | null;
  raisedByPhone: string | null;
  raisedByEmail: string | null;
  complaintText: string;
  assignedTo: string | null;
  assignedAdminId: string | null;
  assignedAdminName?: string | null;
  createdBy: string | null;
  escalationLevel: number;
  escalatedAt: string | null;
  escalationReason: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
  flags: string[];
  tags: string[];
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
  tier4: "Tier 4",
};

export const BUDGET_TIER_RANGES: Record<BudgetTier, string> = {
  tier1: "₹0 – ₹25,000",
  tier2: "₹25,001 – ₹50,000",
  tier3: "₹50,001 – ₹1,00,000",
  tier4: "₹1,00,001+",
};

export const DEFAULT_LEAD_SOURCES = [
  "Instagram",
  "Facebook",
  "Referral",
  "Google",
  "Olready.in",
  "WhatsApp",
  "Cold Call",
  "Other",
];

export const URGENCY_LABELS: Record<UrgencyBand, string> = {
  critical: "Critical",
  hot: "Hot",
  active: "Active",
  longShelf: "Long Shelf",
};

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  highestPrivy: "Privy",
  phoenix2: "Phoenix 2",
  phoenix: "Phoenix",
  pro: "Pro",
  prime: "Prime",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  pendingVerification: "Pending verification",
  verified: "Verified",
  assigned: "Assigned",
  commissionRm: "Commission RM",
  booked: "Booked",
  archived: "Archived",
  missed: "Missed",
  expired: "Expired",
};

export const MUA_PUSH_STAGE_LABELS: Record<MuaPushStage, string> = {
  initialContact: "Initial contact",
  offerSent: "Offer sent",
  followUpDone: "Follow-up done",
  negotiating: "Negotiating",
  brideSelected: "Bride selected",
};

export const MUA_PUSH_STATUS_LABELS: Record<MuaPushStatus, string> = {
  active: "Active",
  closed: "Closed",
  booked: "Booked",
  awaitingClose: "Awaiting close",
};

export const PUSH_OUTCOME_LABELS: Record<PushOutcome, string> = {
  notSelected: "Not selected",
  notInterested: "Not interested in MUA",
  withdrew: "Withdrew",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  followUp: "Follow-up",
  closeConversation: "Close conversation",
  adminReview: "Admin review",
  shiftWarning: "Shift warning",
  collectMuaProspect: "Collect MUA prospect details",
  feedbackFollowUp: "Feedback call-back",
  feedbackReferralFollowUp: "Get referral phone",
  salesFollowUp: "Sales follow-up",
  salesSeniorCall: "Sales senior call",
  salesOnboarding: "Sales onboarding",
  salesActivation: "Sales activation",
  salesAssignRm: "Assign salesperson",
  brideConfirmation: "Bride confirmation call",
  shareProfiles: "Share profiles",
  leadProgressFollowUp: "Lead progress follow-up",
};

/** Default kanban column order and stage pickers — not a required progression path. */
export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "Untouched",
  "Not Connected",
  "Call Back",
  "Follow Up",
  "Details Shared",
  "Demo Scheduled",
  "Demo Done",
  "Senior Call",
  "Senior Call Done",
  "Confirm",
  "Part Payment",
  "Onboarding",
  "Deal Closed",
  "Rejected",
];

export const FLEXIBLE_STAGES: PipelineStage[] = ["Details Shared", "Demo Done"];

export interface CityRegion {
  city: string;
  region: Region;
  state?: string | null;
}
