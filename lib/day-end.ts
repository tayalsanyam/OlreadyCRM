/** Mirrors app UserRole without importing lib/types (keeps client bundles DB-free). */
export type DayEndUserRole =
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

export type DayEndTemplateKey = "sales" | "sales_ops" | "lead_uploader" | "activation" | "feedback" | "rm" | "commission" | "care";
export type DayEndSubmissionType = "report" | "leave";

export const DAY_END_EXEMPT_ROLES: DayEndUserRole[] = ["admin", "owner"];

export const TEMPLATE_BY_ROLE: Record<DayEndUserRole, DayEndTemplateKey | null> = {
  salesRm: "sales",
  salesTl: "sales",
  salesActivation: "activation",
  leadUploader: "lead_uploader",
  feedbackRm: "feedback",
  regionalRm: "rm",
  commissionRm: "commission",
  careAgent: "care",
  admin: null,
  owner: null,
};

export function dayEndTemplateForRole(role: DayEndUserRole): DayEndTemplateKey | null {
  return TEMPLATE_BY_ROLE[role] ?? null;
}

export function isDayEndRequiredRole(role: DayEndUserRole | string): boolean {
  return role in TEMPLATE_BY_ROLE && TEMPLATE_BY_ROLE[role as DayEndUserRole] !== null;
}

const IST = "Asia/Kolkata";

export function todayIstYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(now);
}

export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function previousIstYmd(now = new Date()): string {
  return addDaysToYmd(todayIstYmd(now), -1);
}

export function isNonWorkingDayYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.getDay() === 0;
}

/** @deprecated Use isNonWorkingDayYmd — only Sunday is off (Mon–Sat working). */
export function isWeekendYmd(ymd: string): boolean {
  return isNonWorkingDayYmd(ymd);
}

/** Most recent working day before today (IST). Working week: Mon–Sat; Sunday off. */
export function priorWorkingDayIstYmd(now = new Date()): string {
  let d = previousIstYmd(now);
  while (isNonWorkingDayYmd(d)) {
    d = addDaysToYmd(d, -1);
  }
  return d;
}

/** True when today is Sunday (non-working). */
export function isNonWorkingDayIst(now = new Date()): boolean {
  return isNonWorkingDayYmd(todayIstYmd(now));
}

/** @deprecated Use isNonWorkingDayIst */
export function isWeekendIst(now = new Date()): boolean {
  return isNonWorkingDayIst(now);
}

export function tomorrowIstYmd(now = new Date()): string {
  return addDaysToYmd(todayIstYmd(now), 1);
}

export function monthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

export type TargetVsAchieved = {
  target: number;
  achieved: number;
  gap: number;
};

export type MuaRow = {
  muaId: string;
  muaName: string;
  stage: string;
  lastContact: string | null;
  detail?: string;
  manual?: boolean;
};

export type LeadMuaChip = {
  muaId: string;
  muaName: string;
  /** Conference: surfaced from lead pipeline — tap to mark who was on the call. */
  suggested?: boolean;
  selected?: boolean;
};

export type LeadBrideRow = {
  leadId: string;
  brideName: string;
  lastContact?: string | null;
  comments: string;
  muas?: LeadMuaChip[];
  manual?: boolean;
};

/** Format seconds as e.g. "12m 34s" for day-end talk time. */
export function formatTalkTime(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export type SalesDayEndPayload = {
  targetsVsAchieved: TargetVsAchieved;
  /** Total deals target (potential + existing sold) vs closed MTD. */
  soldTargetsVsAchieved?: TargetVsAchieved;
  lastDealClosedDate: string | null;
  todaysRevenue: number;
  confirmedMuas: MuaRow[];
  demosScheduledToday: MuaRow[];
  /** MUAs moved to Details Shared today (CRM autofill). */
  detailsSharedToday: MuaRow[];
  /** Deals closed today — onboarding or deal closed (CRM autofill). */
  dealsClosedToday: MuaRow[];
  issuesDiscussion: MuaRow[];
  autoSummary: {
    callsMade: number;
    demosFollowUps: number;
    pipelineMoves: number;
  };
};

export type SalesOpsDayEndPayload = {
  callsMade: number;
  tasksClosed: number;
  queueActions: number;
  notes: string;
  manualNotes?: string;
};

export type UploaderCallyzerTouch = {
  durationSec: number;
  calledAt: string | null;
  direction: "inbound" | "outbound" | null;
};

export type LeadUploaderLeadRow = {
  leadId: string;
  displayId: string;
  brideName: string;
  detail: string;
  callyzer: UploaderCallyzerTouch | null;
  /** Worked today but no Callyzer call logged for this lead — highlight in red. */
  workedWithoutCallyzer: boolean;
  remarks?: string;
};

export type LeadUploaderReferralRow = {
  id: string;
  referralName: string;
  referralPhone: string | null;
  sourceBrideName: string;
  notes: string | null;
  status: "picked_up" | "converted" | "dismissed";
};

export function leadUploaderReferralWorkedLabel(
  status: LeadUploaderReferralRow["status"]
): string {
  switch (status) {
    case "picked_up":
      return "Picked up";
    case "converted":
      return "Verified";
    case "dismissed":
      return "Rejected";
    default:
      return status;
  }
}

export type LeadUploaderDayEndPayload = {
  callsMade: number;
  talkTimeSec: number;
  leadsUploaded: number;
  tasksCompleted: number;
  leadsVerifiedToday: LeadUploaderLeadRow[];
  leadsReVerifiedToday: LeadUploaderLeadRow[];
  notAnsweringToday: LeadUploaderLeadRow[];
  closedNotInterestedToday: LeadUploaderLeadRow[];
  feedbackReferralsAdded: LeadUploaderReferralRow[];
};

export type ActivationPlanActivatedRow = {
  pipelineId: string;
  muaName: string;
  muaCity: string;
  plan: string;
  leadCap: number | null;
  leadBudget: string | null;
  quotedAmount: number | null;
  durationEnd: string | null;
  regions: string[];
  cities: string[];
  invoiceNumber: string | null;
  activatedAt: string;
  remarks?: string;
};

export type ActivationQueueRow = {
  pipelineId: string;
  muaName: string;
  muaCity: string;
  muaType: string;
  assignedSalesName: string | null;
  daysInStage: number;
  stageLabel: string;
  pendingActions: string[];
  remarks?: string;
};

export type ActivationDayEndPayload = {
  callsMade: number;
  talkTimeSec: number;
  plansActivatedToday: ActivationPlanActivatedRow[];
  activationQueue: ActivationQueueRow[];
};

export type FeedbackDayEndDetailRow = {
  leadId: string;
  displayId: string;
  brideName: string;
  detail: string;
  callyzer?: UploaderCallyzerTouch | null;
  workedWithoutCallyzer?: boolean;
  remarks?: string;
};

export type FeedbackDayEndReferralLeadRow = {
  id: string;
  leadId: string;
  displayId: string;
  brideName: string;
  referralName: string;
  referralPhone: string | null;
  detail: string;
  remarks?: string;
};

export type FeedbackDayEndReferralMuaRow = {
  id: string;
  leadId: string;
  brideName: string;
  muaName: string;
  phone: string | null;
  city: string | null;
  detail: string;
  remarks?: string;
};

export type FeedbackDayEndRatingRow = {
  feedbackId: string;
  leadId: string;
  displayId: string;
  brideName: string;
  rating: number;
  muaName: string | null;
  detail: string;
  callyzer?: UploaderCallyzerTouch | null;
  workedWithoutCallyzer?: boolean;
  remarks?: string;
};

export type FeedbackDayEndPayload = {
  callsMade: number;
  talkTimeSec: number;
  postEventLeadsInQueue: number;
  contactedToday: number;
  followUpFromToday: FeedbackDayEndDetailRow[];
  feedbackGivenToday: FeedbackDayEndDetailRow[];
  refusedToday: FeedbackDayEndDetailRow[];
  referralsLeadToday: FeedbackDayEndReferralLeadRow[];
  referralsMuaToday: FeedbackDayEndReferralMuaRow[];
  negativeOlreadyToday: FeedbackDayEndRatingRow[];
  positiveOlreadyToday: FeedbackDayEndRatingRow[];
  negativeMuaToday: FeedbackDayEndRatingRow[];
  positiveMuaToday: FeedbackDayEndRatingRow[];
};

export type RmActivityPushRow = {
  pushId: string;
  leadId: string;
  brideName: string;
  muaId: string;
  muaName: string;
  ceremonyType?: string;
  detail?: string;
  comments?: string;
};

export type RmActivityBookingRow = {
  bookingId: string;
  leadId: string;
  brideName: string;
  muaId: string;
  muaName: string;
  ceremonyType?: string;
  bookedPrice?: number;
  comments?: string;
};

export type RmStalePlanMuaRow = {
  muaId: string;
  muaName: string;
  planTier: string;
  lastPushedAt: string | null;
  daysSincePush: number | null;
  detail?: string;
  comments?: string;
};

export type RmDayEndPayload = {
  bookingTargetVsAchieved: TargetVsAchieved;
  pushTargetVsAchieved: TargetVsAchieved;
  privyBookingsMtd: number;
  privyBookingsToday: number;
  pushToday: number;
  bookingsToday: number;
  callsToday: number;
  talkTimeSec: number;
  /** Regional RM — auto-filled list of pushes created today. */
  allPushesToday?: RmActivityPushRow[];
  /** Regional RM — auto-filled list of bookings confirmed today. */
  allBookingsToday?: RmActivityBookingRow[];
  /** Regional RM — MUAs with push/booking/call activity today. */
  muasWorkedToday?: MuaRow[];
  /** Regional RM — Privy / Phoenix / Phoenix 2 plan MUAs not pushed in 7+ days. */
  stalePlanMuasNotPushed?: RmStalePlanMuaRow[];
  pipelinesTomorrow: LeadBrideRow[];
  conferenceCalls: LeadBrideRow[];
};

export type CommissionDayEndPayload = RmDayEndPayload & {
  commissionTargetVsAchieved: TargetVsAchieved;
  commissionEarnedToday: number;
  paymentsReceivedToday: number;
  pendingPaymentsMtd: number;
  overallPendingPayments: number;
};

export type CareTicketRow = {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  partyName?: string;
  partyType?: "bride" | "mua" | "other";
  partyPhone?: string | null;
  issueSummary?: string;
  status?: string;
  todayAction?: string;
  daysSinceOpen?: number;
  escalationLevel?: number;
  priority?: string;
  lastContact?: string | null;
  detail?: string;
  remarks?: string;
  manual?: boolean;
  callyzer?: UploaderCallyzerTouch | null;
  workedWithoutCallyzer?: boolean;
};

export type CareCallyzerMuaContactRow = {
  callLogId: string;
  ticketId: string;
  ticketNumber: string;
  muaName: string;
  muaPhone: string | null;
  issueSummary: string;
  callyzer: UploaderCallyzerTouch;
  remarks?: string;
};

export type CareChatSupportRow = {
  inquiryId: string;
  displayId: string;
  visitorName: string;
  visitorKind: string;
  phone: string | null;
  detail: string;
  remarks?: string;
};

export type CareDayEndPayload = {
  totalOpenTickets: number;
  callsMade: number;
  talkTimeSec: number;
  openL2L3Count: number;
  callyzerMuaContacts: CareCallyzerMuaContactRow[];
  ticketsClosedToday: CareTicketRow[];
  issuesListToday: CareTicketRow[];
  issuesAddressedToday: CareTicketRow[];
  urgentIssues: CareTicketRow[];
  tasksDoneToday: number;
  pendingTasks: number;
  discussionPoints: CareTicketRow[];
  chatSupportActivity: CareChatSupportRow[];
  manualTickets: CareTicketRow[];
};

export type DayEndPayload =
  | SalesDayEndPayload
  | SalesOpsDayEndPayload
  | LeadUploaderDayEndPayload
  | ActivationDayEndPayload
  | FeedbackDayEndPayload
  | RmDayEndPayload
  | CommissionDayEndPayload
  | CareDayEndPayload;

export type DayEndCheckoutRow = {
  id: string;
  staffId: string;
  staffName?: string;
  staffRole?: string;
  reportDate: string;
  templateKey: DayEndTemplateKey;
  submissionType: DayEndSubmissionType;
  payload: DayEndPayload;
  submittedAt: string;
  updatedAt: string;
};

export type DayEndStatus = {
  exempt: boolean;
  today: string;
  todaySubmitted: boolean;
  todaySubmissionType: DayEndSubmissionType | null;
  blocked: boolean;
  templateKey: DayEndTemplateKey | null;
};
