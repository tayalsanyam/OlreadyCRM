import {
  mergeBudgetTierConfig,
  resolveLeadBudgetTier,
} from "@/lib/budget-tier";
import {
  deriveLeadPrimaryRegion,
  leadEventLocationSummary,
  regionsForEventIds,
} from "@/lib/ceremony-region";
import { toDbExitMarkedByRole, RM_NI_ARCHIVE_HANDOVER, LEAD_EXIT_LABELS } from "@/lib/lead-exit";
import {
  BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE,
  canPushMuaToLead,
} from "@/lib/lead-intake-config";
import { commissionSlaDueDate, commissionOverdueDate } from "@/lib/commission-booking";
import { commissionCollectionTaskTitle } from "@/lib/commission-collection-tasks";
import { startOfWeekMonday } from "@/db/index";
import { PHONE_NON_BLOCKING_STATUSES } from "@/lib/lead-phone-duplicate";
import { exitKindFromRow } from "@/lib/lead-exit";
import type { PhoneLeadHistoryRow } from "@/lib/lead-phone-history";
import {
  allBookingsFinanciallySettled,
  buildBookingCancelledTaskTitle,
  buildPostBookingTaskTitle,
} from "@/lib/post-booking-tasks";
import {
  isFinancialFollowUpTask,
  isPostBookingFollowUpTitle,
  parseCommissionBookingIdFromTitle,
  taskRequiresPushCompletion,
} from "@/lib/task-utils";
import type { TaskFinancialBookingSnapshot } from "@/lib/task-financial-bookings";
import {
  bookingShowsCommission,
  commissionCollectionStage,
  commissionOutstanding,
  commissionPaymentStatus,
} from "@/lib/commission-booking";
import {
  bookingAmountPaid,
  bookingOutstanding,
  bookingPaymentStatus,
} from "@/lib/booking-payment";
import { cancelPendingMuaTasksMock } from "@/lib/task-duplicates";
import { normalizePhone } from "@/lib/phone";
import type { VerifiedRoutingFilter } from "@/lib/upload-verified-filters";
import { muaMatchesRegion, resolveMuaRegions } from "@/lib/mua-region";
import { isMuaNotOnPlan } from "@/lib/mua-active-plan";
import type {
  BrideLead,
  CommEntry,
  LeadEvent,
  LeadFull,
  Mua,
  MuaDetailProfile,
  MuaPlanHistoryRow,
  MuaPush,
  MuaPushEventPrice,
  MuaPushLeadRow,
  MuaPushWithDetails,
  PipelineHealthBucket,
  PipelineHealthLead,
  Plan,
  PlanTier,
  Region,
  RmMuaRosterItem,
  SlaConfig,
  Task,
  UrgencyBand,
  User,
  UserRole,
} from "./types";
import { DEFAULT_PER_LEAD_CAP } from "@/lib/sla-defaults";
import { PLAN_TIER_LABELS } from "./types";
import { sortLeads } from "./utils";
import type { WhatsAppConfig } from "@/lib/whatsapp/config";

const PLAN_CAPS: Record<PlanTier, number> = {
  highestPrivy: 10,
  phoenix2: 7,
  phoenix: 7,
  pro: 2,
  prime: 1,
};

const SLA: SlaConfig = {
  id: 1,
  perLeadCap: DEFAULT_PER_LEAD_CAP,
  assignmentWindowDays: 45,
  shiftWarningDay: 40,
  inactivityThresholdHours: 48,
  capBypassDays: 30,
  criticalMaxDays: 30,
  hotMaxDays: 45,
  activeMaxDays: 90,
  ceremonyTypes: ["Haldi", "Mehndi", "Sangeet", "Wedding", "Reception"],
  autoAssignEnabled: true,
  autoAssignBy: "least_load",
  budgetTierLimits: mergeBudgetTierConfig().limits,
  budgetTierRanges: mergeBudgetTierConfig().ranges,
  updatedAt: new Date().toISOString(),
};

let whatsappConfigStore: WhatsAppConfig = {};

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function computeBand(eventDate: string): UrgencyBand {
  const d = Math.ceil(
    (new Date(eventDate).getTime() - Date.now()) / 86400000
  );
  if (d <= SLA.criticalMaxDays) return "critical";
  if (d <= SLA.hotMaxDays) return "hot";
  if (d <= SLA.activeMaxDays) return "active";
  return "longShelf";
}

function toLeadFull(l: BrideLead): LeadFull {
  const days = Math.ceil(
    (new Date(l.eventDate).getTime() - Date.now()) / 86400000
  );
  const daysSince = l.assignmentDate
    ? Math.floor(
        (Date.now() - new Date(l.assignmentDate).getTime()) / 86400000
      )
    : null;
  return {
    ...l,
    urgencyBand: computeBand(l.eventDate),
    daysToEvent: days,
    assignmentDaysRemaining:
      daysSince !== null
        ? Math.max(0, SLA.assignmentWindowDays - daysSince)
        : null,
    daysSinceAssignment: daysSince,
    assignedRmName: users.find((u) => u.id === l.assignedRmId)?.name ?? null,
    activePushesCount: pushes.filter(
      (p) =>
        p.leadId === l.id && !["closed", "booked"].includes(p.status)
    ).length,
    muasOfferedCount: new Set(
      pushes.filter((p) => p.leadId === l.id).map((p) => p.muaId)
    ).size,
    muasOfferedNames:
      [
        ...new Set(
          pushes
            .filter((p) => p.leadId === l.id)
            .map((p) => muas.find((m) => m.id === p.muaId)?.name)
            .filter((n): n is string => Boolean(n))
        ),
      ].join(", ") || null,
    eventCount: events.filter(
      (e) => e.leadId === l.id && e.status !== "notNeeded"
    ).length,
    bookedEventCount: events.filter(
      (e) => e.leadId === l.id && e.status === "booked"
    ).length,
    openEventCount: events.filter(
      (e) => e.leadId === l.id && e.status === "open"
    ).length,
    eventLabels:
      events
        .filter((e) => e.leadId === l.id && e.status !== "notNeeded")
        .map((e) => {
          const amt =
            e.budgetAmount != null && e.budgetAmount > 0
              ? ` · Rs. ${e.budgetAmount.toLocaleString("en-IN")}`
              : "";
          return `${e.ceremonyType}${amt}`;
        })
        .join(", ") || null,
    lastActivityAt:
      comms
        .filter((c) => c.leadId === l.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        ?.createdAt ?? null,
  };
}

// ——— seed (mutable copies) ———
const users: User[] = [
  { id: "u-kanika", email: "kanika@olready.in", name: "Kanika", role: "regionalRm", region: "north", active: true, createdAt: "", updatedAt: "" },
  { id: "u-rm-north", email: "rm.north@olready.in", name: "Priya Sharma", role: "regionalRm", region: "north", active: true, createdAt: "", updatedAt: "" },
  { id: "u-commission", email: "commission@olready.in", name: "Rahul Mehta", role: "commissionRm", region: null, active: true, createdAt: "", updatedAt: "" },
  { id: "u-commission-2", email: "commission2@olready.in", name: "Sneha Verma", role: "commissionRm", region: null, active: true, createdAt: "", updatedAt: "" },
  { id: "u-uploader", email: "uploader@olready.in", name: "Anita Desai", role: "leadUploader", region: null, active: true, createdAt: "", updatedAt: "" },
  { id: "u-admin", email: "admin@olready.in", name: "Vikram Singh", role: "admin", region: null, active: true, createdAt: "", updatedAt: "" },
  { id: "u-owner", email: "owner@olready.in", name: "Sanya Kapoor", role: "owner", region: null, active: true, createdAt: "", updatedAt: "" },
];

let planHistory: MuaPlanHistoryRow[] = [];

let muas: Mua[] = [
  { id: "mua-1", displayId: "MUA-0001", name: "Deepa Artistry", city: "Delhi", regions: ["north"], bio: "15+ years bridal specialist.", services: ["Bridal makeup", "HD makeup", "On-location"], planTier: "highestPrivy", planExpiry: "2026-12-31", status: "active", whatsapp: "+91 98100 11111", instagram: "@deepa_artistry", specialties: ["Bridal", "HD"], assignedRmId: "u-kanika", planRmId: "u-kanika", joinDate: "2025-01-15", createdAt: "", updatedAt: "" },
  { id: "mua-2", displayId: "MUA-0002", name: "Zara Bridal", city: "Mumbai", regions: ["west"], bio: null, services: ["Bridal", "Reception"], planTier: "phoenix2", planExpiry: "2026-11-30", status: "active", whatsapp: null, instagram: null, specialties: [], assignedRmId: null, joinDate: "2025-03-01", createdAt: "", updatedAt: "" },
  { id: "mua-3", displayId: "MUA-0003", name: "Glam Studio", city: "Bangalore", regions: ["south"], bio: null, services: ["Bridal makeup"], planTier: "phoenix", planExpiry: "2026-10-15", status: "active", whatsapp: null, instagram: null, specialties: [], assignedRmId: null, joinDate: "2025-02-01", createdAt: "", updatedAt: "" },
  { id: "mua-4", displayId: "MUA-0004", name: "Preethi Looks", city: "Chennai", regions: ["south"], bio: null, services: [], planTier: "pro", planExpiry: "2026-09-01", status: "active", whatsapp: null, instagram: null, specialties: [], assignedRmId: null, joinDate: "2025-04-01", createdAt: "", updatedAt: "" },
  { id: "mua-5", displayId: "MUA-0005", name: "Glow by Nisha", city: "Jaipur", regions: ["north"], bio: null, services: [], planTier: "prime", planExpiry: "2026-08-20", status: "active", whatsapp: null, instagram: null, specialties: [], assignedRmId: null, joinDate: "2025-05-01", createdAt: "", updatedAt: "" },
  { id: "mua-np-1", displayId: "MUA-0099", name: "Freelance by Riya", city: "Delhi", regions: ["north", "east", "west", "south"], bio: null, services: [], planTier: null, planExpiry: null, status: "active", whatsapp: null, instagram: null, specialties: [], assignedRmId: null, joinDate: "2026-01-01", createdAt: "", updatedAt: "" },
];

let plans: Plan[] = (Object.keys(PLAN_CAPS) as PlanTier[]).map((tier, i) => ({
  id: `plan-${i}`,
  tier,
  name: PLAN_TIER_LABELS[tier],
  weeklyCap: PLAN_CAPS[tier],
  sortOrder: i + 1,
  active: true,
  createdAt: "",
  updatedAt: "",
}));

let leads: BrideLead[] = [
  { id: "ld-1", displayId: "LD-00001", brideName: "Aisha Khan", phone: "+91 98111 00001", email: "aisha@email.com", city: "Delhi", region: "north", eventLocation: "Taj Palace", eventDate: "2026-05-20", budgetAmount: 150000, budgetTier: "tier1", source: "Instagram", status: "assigned", verified: true, verifiedAt: "", verifiedBy: "u-uploader", assignedRmId: "u-kanika", assignmentDate: "2026-04-01", shiftedAt: null, ownerAssignedAt: null, handoverReason: null, groupSize: 1, groupNotes: null, hostileNote: null, createdAt: "", updatedAt: "" },
  { id: "ld-2", displayId: "LD-00002", brideName: "Meera Patel", phone: "+91 98222 00002", email: "meera@email.com", city: "Mumbai", region: "west", eventLocation: "JW Marriott", eventDate: "2026-07-10", budgetAmount: 80000, budgetTier: "tier2", source: "Karwan", status: "verified", verified: true, verifiedAt: "", verifiedBy: "u-uploader", assignedRmId: null, assignmentDate: null, shiftedAt: null, ownerAssignedAt: null, handoverReason: null, groupSize: 1, groupNotes: null, hostileNote: null, createdAt: "", updatedAt: "" },
  { id: "ld-pending", displayId: "LD-00009", brideName: "Tanvi Shah", phone: "+91 98333 00003", email: null, city: "Delhi", region: "north", eventLocation: "Leela Palace", eventDate: "2026-08-01", budgetAmount: 45000, budgetTier: "tier3", source: "Referral", status: "pendingVerification", verified: false, verifiedAt: null, verifiedBy: null, assignedRmId: null, assignmentDate: null, shiftedAt: null, ownerAssignedAt: null, handoverReason: null, groupSize: 1, groupNotes: null, hostileNote: null, createdAt: "", updatedAt: "" },
  { id: "ld-hostile", displayId: "LD-00012", brideName: "Kavya Nair", phone: "+91 98555 00012", email: null, city: "Bangalore", region: "south", eventLocation: "Taj West End", eventDate: "2026-10-15", budgetAmount: 60000, budgetTier: "tier2", source: "Instagram", status: "archived", verified: true, verifiedAt: "", verifiedBy: "u-uploader", assignedRmId: null, assignmentDate: null, shiftedAt: null, ownerAssignedAt: null, handoverReason: null, groupSize: 1, groupNotes: null, hostileNote: "Abusive language on call; do not re-engage without manager approval.", createdAt: "", updatedAt: "" },
  { id: "ld-7", displayId: "LD-00007", brideName: "Divya Joshi", phone: "+91 98444 00004", email: "divya@email.com", city: "Jaipur", region: "north", eventLocation: "Rambagh", eventDate: "2026-09-05", budgetAmount: 55000, budgetTier: "tier3", source: "Instagram", status: "commissionRm", verified: true, verifiedAt: "", verifiedBy: "u-uploader", assignedRmId: "u-commission", assignmentDate: null, shiftedAt: "2026-04-15T00:00:00Z", ownerAssignedAt: "2026-04-15T00:00:00Z", handoverReason: "Not Interested in Plan MUAs", groupSize: 1, groupNotes: null, hostileNote: null, createdAt: "", updatedAt: "" },
];

function scheduleCommissionHandoverTasksMock(
  leadId: string,
  displayId: string,
  handoverReason: string | null | undefined,
  commissionRmId: string
) {
  const lead = leads.find((l) => l.id === leadId);
  const rm = users.find((u) => u.id === commissionRmId && u.role === "commissionRm");
  if (!rm) return;
  const reason = handoverReason?.trim() || "Commission handover";
  const title = `Follow up — ${displayId} (${reason})`;
  tasks.push({
    id: uid("tk"),
    displayId: `TK-${tasks.length + 1}`,
    userId: rm.id,
    staffId: rm.id,
    leadId,
    pushId: null,
    taskType: "followUp",
    title,
    dueDate: addDaysISO(1),
    status: "pending",
    createdAt: "",
    updatedAt: "",
    leadName: lead?.brideName,
    brideDisplayId: displayId,
  });
}

function pickCommissionRmMock(): string | null {
  const active = users.filter((u) => u.role === "commissionRm" && u.active);
  if (!active.length) return null;
  const loads = active.map((rm) => ({
    id: rm.id,
    load: leads.filter((l) => l.status === "commissionRm" && l.assignedRmId === rm.id)
      .length,
  }));
  loads.sort((a, b) => a.load - b.load);
  return loads[0]?.id ?? null;
}

function reconcileMockLeadStatus(leadId: string) {
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  const pending = events.filter(
    (e) => e.leadId === leadId && !["booked", "notNeeded"].includes(e.status)
  ).length;
  const booked = events.filter(
    (e) => e.leadId === leadId && e.status === "booked"
  ).length;
  if (pending === 0 && booked > 0) {
    lead.status = "booked";
    return;
  }
  if (lead.status === "booked" && pending > 0) {
    lead.status = lead.shiftedAt ? "commissionRm" : "assigned";
  }
}

let mockBookings: import("./types").Booking[] = [];

let events: LeadEvent[] = [
  { id: "ev-1", leadId: "ld-1", ceremonyType: "Mehndi", eventDate: "2026-05-18", status: "open", muaId: null, bookedPrice: null, createdAt: "", updatedAt: "" },
  { id: "ev-2", leadId: "ld-1", ceremonyType: "Wedding", eventDate: "2026-05-20", status: "open", muaId: null, bookedPrice: null, createdAt: "", updatedAt: "" },
  { id: "ev-3", leadId: "ld-1", ceremonyType: "Reception", eventDate: "2026-05-21", status: "open", muaId: null, bookedPrice: null, createdAt: "", updatedAt: "" },
  { id: "ev-7a", leadId: "ld-7", ceremonyType: "Wedding", eventDate: "2026-09-05", status: "open", muaId: null, bookedPrice: null, createdAt: "", updatedAt: "" },
];

let pushes: MuaPush[] = [
  { id: "push-1", leadId: "ld-1", muaId: "mua-1", stage: "negotiating", status: "active", outcome: null, quotedTotal: 38000, eventIds: ["ev-1", "ev-2"], bypassReason: null, pushedBy: "u-kanika", closedAt: null, createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), updatedAt: "" },
  { id: "push-2", leadId: "ld-1", muaId: "mua-2", stage: "offerSent", status: "active", outcome: null, quotedTotal: 42000, eventIds: ["ev-2"], bypassReason: null, pushedBy: "u-kanika", closedAt: null, createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), updatedAt: "" },
];

let pushEventPrices: MuaPushEventPrice[] = [
  { id: "pep-1", pushId: "push-1", eventId: "ev-1", quotedPrice: 18000 },
  { id: "pep-2", pushId: "push-1", eventId: "ev-2", quotedPrice: 20000 },
  { id: "pep-3", pushId: "push-2", eventId: "ev-2", quotedPrice: 42000 },
];

let comms: CommEntry[] = [
  { id: "c-1", leadId: "ld-1", entryType: "leadCreated", description: "Lead imported from Instagram", actorId: null, metadata: {}, createdAt: "2026-04-01T10:00:00Z", actorName: "System" },
  { id: "c-2", leadId: "ld-1", entryType: "leadVerified", description: "Lead verified by Anita Desai", actorId: "u-uploader", metadata: {}, createdAt: "2026-04-02T09:00:00Z", actorName: "Anita Desai", actorRole: "leadUploader" },
  { id: "c-3", leadId: "ld-1", entryType: "assigned", description: "Assigned to Kanika (North)", actorId: "u-admin", metadata: {}, createdAt: "2026-04-03T11:00:00Z", actorName: "Vikram Singh", actorRole: "admin" },
  { id: "c-4", leadId: "ld-1", muaId: "mua-1", entryType: "muaPushed", description: "Pushed Deepa Artistry — Rs. 38,000", actorId: "u-kanika", metadata: {}, createdAt: "2026-04-05T14:00:00Z", actorName: "Kanika", actorRole: "regionalRm" },
  { id: "c-6", leadId: "ld-7", entryType: "shiftedCommission", description: "Not Interested in Plan MUAs — shifted to Commission RM", actorId: "u-kanika", metadata: {}, createdAt: "2026-04-12T16:00:00Z", actorName: "Kanika", actorRole: "regionalRm" },
];

let tasks: Task[] = [
  { id: "tk-1", displayId: "TK-00001", userId: "u-kanika", leadId: "ld-1", pushId: "push-2", taskType: "closeConversation", title: "Close MUA conversation — Zara Bridal", dueDate: "2026-05-25", status: "pending", createdAt: "", updatedAt: "", leadName: "Aisha Khan", brideDisplayId: "LD-00001" },
];

function addComm(
  leadId: string,
  entryType: CommEntry["entryType"],
  description: string,
  actorId: string | null,
  actorName?: string,
  actorRole?: User["role"],
  muaId?: string | null
): void {
  comms.push({
    id: uid("c"),
    leadId,
    muaId: muaId ?? null,
    entryType,
    description,
    actorId,
    metadata: muaId ? { muaId } : {},
    createdAt: new Date().toISOString(),
    actorName: actorName ?? users.find((u) => u.id === actorId)?.name ?? "System",
    actorRole,
  });
}

const STAGE_TASK_RULES: Record<
  string,
  { title: (mua: string, bride: string) => string; days: number } | null
> = {
  initialContact: null,
  offerSent: {
    title: (mua, bride) => `Follow up on offer — ${mua} for ${bride}`,
    days: 2,
  },
  followUpDone: {
    title: (mua, bride) => `Check bride response — ${mua} offer on ${bride}`,
    days: 1,
  },
  negotiating: {
    title: (mua, bride) => `Close negotiation — ${mua} / ${bride}`,
    days: 1,
  },
  brideSelected: {
    title: (mua, bride) => `Confirm booking — ${bride} has selected ${mua}`,
    days: 0,
  },
};

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mockPhoneBlocksCreate(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return leads.some(
    (l) =>
      !PHONE_NON_BLOCKING_STATUSES.includes(
        l.status as (typeof PHONE_NON_BLOCKING_STATUSES)[number]
      ) &&
      normalizePhone(l.phone) === normalized
  );
}

function mockFindMuaByPhone(phone: string): { id: string; displayId: string; name: string } | null {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return null;
  const mua = muas.find((m) => m.phone && normalizePhone(m.phone) === normalized);
  return mua ? { id: mua.id, displayId: mua.displayId, name: mua.name } : null;
}

function matchesVerifiedRoutingFilter(
  lead: BrideLead & { portalOnly?: boolean },
  routing: VerifiedRoutingFilter
): boolean {
  switch (routing) {
    case "regional_rm":
      return lead.status === "assigned" && !!lead.assignedRmId;
    case "commission":
      return lead.status === "commissionRm";
    case "portal":
      return lead.status === "verified" && !!lead.portalOnly;
    case "rm_queue":
      return lead.status === "verified" && !lead.portalOnly && !lead.assignedRmId;
    default:
      return true;
  }
}

function mockFinancialBookingSnapshot(
  booking: (typeof mockBookings)[number],
  lead: BrideLead | undefined,
  ceremonyType: string,
  muaName: string
): TaskFinancialBookingSnapshot {
  const trackCommission =
    !!lead?.shiftedAt ||
    lead?.status === "commissionRm" ||
    bookingShowsCommission({
      trackCommission: true,
      commissionAmount: booking.commissionAmount,
      commissionPaid: booking.commissionPaid,
    });
  const bridePreview = {
    bookedPrice: Number(booking.bookedPrice),
    advancePaid: booking.advancePaid,
    fullPaid: booking.fullPaid,
  };
  return {
    id: booking.id,
    ceremonyType,
    muaName,
    bookedPrice: Number(booking.bookedPrice),
    bookingDate: booking.bookingDate,
    advancePaid: booking.advancePaid,
    fullPaid: booking.fullPaid,
    paymentMode: booking.paymentMode,
    zohoInvoiceRef: booking.zohoInvoiceRef,
    brideFullyPaidAt: booking.brideFullyPaidAt,
    brideStatus: bookingPaymentStatus(bridePreview),
    brideOutstanding: bookingOutstanding(bridePreview),
    brideCollected: bookingAmountPaid(bridePreview),
    trackCommission,
    commissionAmount: booking.commissionAmount,
    commissionPaid: booking.commissionPaid,
    commissionOutstanding: trackCommission
      ? commissionOutstanding({
          commissionAmount: booking.commissionAmount,
          commissionPaid: booking.commissionPaid,
        })
      : 0,
    commissionStatus: trackCommission
      ? commissionPaymentStatus({
          commissionAmount: booking.commissionAmount,
          commissionPaid: booking.commissionPaid,
        })
      : "paid",
    commissionStage: trackCommission
      ? commissionCollectionStage({
          commissionAmount: booking.commissionAmount,
          commissionPaid: booking.commissionPaid,
          bookingDate: booking.bookingDate,
        })
      : "paid",
    commissionNextFollowUpAt: booking.commissionNextFollowUpAt ?? null,
    bridePaymentDismissed:
      booking.brideFullyPaidAt != null &&
      bookingPaymentStatus(bridePreview) !== "paid",
  };
}

export const mockStore = {
  getSla: (): SlaConfig => ({ ...SLA, ceremonyTypes: [...SLA.ceremonyTypes] }),
  updateSla: (patch: Partial<SlaConfig>): SlaConfig => {
    Object.assign(SLA, patch);
    if (patch.ceremonyTypes) SLA.ceremonyTypes = [...patch.ceremonyTypes];
    return mockStore.getSla();
  },
  getWhatsAppConfig: (): WhatsAppConfig => ({
    ...whatsappConfigStore,
    templateBodies: { ...whatsappConfigStore.templateBodies },
    savedTemplates: [...(whatsappConfigStore.savedTemplates ?? [])],
  }),
  updateWhatsAppConfig: (patch: WhatsAppConfig): WhatsAppConfig => {
    whatsappConfigStore = {
      ...whatsappConfigStore,
      ...patch,
      templateBodies: { ...whatsappConfigStore.templateBodies, ...patch.templateBodies },
      savedTemplates: patch.savedTemplates ?? whatsappConfigStore.savedTemplates,
      salesStageDefaults: { ...whatsappConfigStore.salesStageDefaults, ...patch.salesStageDefaults },
      rmPushStageDefaults: { ...whatsappConfigStore.rmPushStageDefaults, ...patch.rmPushStageDefaults },
      rmPushBrideDefaults: { ...whatsappConfigStore.rmPushBrideDefaults, ...patch.rmPushBrideDefaults },
    };
    return mockStore.getWhatsAppConfig();
  },
  getPlans: (): Plan[] => plans.map((p) => ({ ...p })),
  updatePlan: (id: string, patch: Partial<Plan>): Plan | null => {
    const i = plans.findIndex((p) => p.id === id);
    if (i < 0) return null;
    plans[i] = { ...plans[i], ...patch };
    return { ...plans[i] };
  },
  getMuas: (filters?: { tier?: string; city?: string }): Mua[] => {
    let list = muas.map((m) => ({ ...m }));
    if (filters?.tier) list = list.filter((m) => m.planTier === filters.tier);
    if (filters?.city)
      list = list.filter((m) =>
        m.city.toLowerCase().includes(filters.city!.toLowerCase())
      );
    return list;
  },
  getCeremonyRegionsForEvents: (leadId: string, eventIds: string[]) =>
    regionsForEventIds(
      eventIds,
      events.filter((e) => e.leadId === leadId)
    ),

  getAvailableMuas: (
    leadId: string,
    commissionMode: boolean,
    options: { rmRegion?: Region | null; ceremonyRegions?: Region[] } = {}
  ) => {
    const { rmRegion = null, ceremonyRegions = [] } = options;
    const filterRegions = commissionMode
      ? []
      : ceremonyRegions.length > 0
        ? ceremonyRegions
        : rmRegion
          ? [rmRegion]
          : [];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    return muas
      .filter((m) => {
        if (!(commissionMode || m.planTier)) return false;
        if (!filterRegions.length) return true;
        return filterRegions.some((region) => {
          const hasPushInRegion = pushes.some((p) => {
            if (p.muaId !== m.id) return false;
            const bl = leads.find((l) => l.id === p.leadId);
            return bl?.region === region;
          });
          return muaMatchesRegion(m, region, hasPushInRegion);
        });
      })
      .map((m) => {
        const weeklyCap = m.planTier ? PLAN_CAPS[m.planTier] : 99;
        const weeklyUsed = pushes.filter(
          (p) =>
            p.muaId === m.id &&
            new Date(p.createdAt) >= weekStart
        ).length;
        const leadActive = pushes.filter(
          (p) =>
            p.leadId === leadId && !["closed", "booked"].includes(p.status)
        ).length;
        const latestOnLead = pushes
          .filter((p) => p.leadId === leadId && p.muaId === m.id)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
        const eventLabels = latestOnLead
          ? latestOnLead.eventIds
              .map((eid) => events.find((e) => e.id === eid)?.ceremonyType)
              .filter(Boolean)
              .join(", ")
          : null;
        return {
          ...m,
          weeklyCap,
          weeklyUsed,
          leadActiveCount: leadActive,
          perLeadCap: SLA.perLeadCap,
          atWeeklyCap: weeklyUsed >= weeklyCap,
          leadPushId: latestOnLead?.id ?? null,
          leadPushStatus: latestOnLead?.status ?? null,
          leadPushStage: latestOnLead?.stage ?? null,
          leadPushEventLabels: eventLabels || null,
          phone: m.phone ?? null,
          whatsapp: m.whatsapp ?? null,
        };
      });
  },
  getLeadsQueue: (
    session: { role: string; userId: string; region: string | null },
    opts: {
      status?: string;
      region?: string;
      tiers?: string[];
      bands?: string[];
      eventFrom?: string;
      eventTo?: string;
      portal?: "on" | "off";
    }
  ): LeadFull[] | null => {
    if (session.role === "leadUploader") return null;
    if (session.role === "commissionRm" && opts.status && opts.status !== "commissionRm") {
      return null;
    }

    let list = leads.filter((l) => {
      if (session.role === "commissionRm" && l.status !== "commissionRm") return false;
      if (session.role === "commissionRm") {
        if (l.assignedRmId && l.assignedRmId !== session.userId) return false;
      }
      if (session.role === "regionalRm") {
        if (l.assignedRmId !== session.userId) return false;
        if (session.region && l.region !== session.region) return false;
      }
      if (opts.status && l.status !== opts.status) return false;
      if (opts.region && l.region !== opts.region) return false;
      if (opts.eventFrom && l.eventDate < opts.eventFrom) return false;
      if (opts.eventTo && l.eventDate > opts.eventTo) return false;
      if (opts.portal === "on" && !l.portalPushed) return false;
      if (opts.portal === "off" && l.portalPushed) return false;
      return true;
    });
    let full = list.map(toLeadFull);
    if (opts.tiers?.length)
      full = full.filter((l) => opts.tiers!.includes(l.budgetTier));
    if (opts.bands?.length)
      full = full.filter((l) => opts.bands!.includes(l.urgencyBand));
    return sortLeads(full);
  },
  getLeadEvents: (leadId: string) =>
    events.filter((e) => e.leadId === leadId),

  getLead: (id: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return null;
    const leadPushIds = pushes.filter((p) => p.leadId === id).map((p) => p.id);
    return {
      lead: toLeadFull(lead),
      events: events.filter((e) => e.leadId === id),
      comms: comms
        .filter((c) => c.leadId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      bookings: mockBookings.filter((b) => b.leadId === id),
      pushEventPrices: pushEventPrices.filter((p) => leadPushIds.includes(p.pushId)),
    };
  },
  updateGroup: (
    leadId: string,
    group: { groupSize?: number; groupNotes?: string }
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    if (group.groupSize != null) lead.groupSize = group.groupSize;
    if (group.groupNotes != null) lead.groupNotes = group.groupNotes;
  },
  getPushes: (leadId: string): MuaPushWithDetails[] =>
    pushes
      .filter((p) => p.leadId === leadId)
      .map((p) => {
        const mua = muas.find((m) => m.id === p.muaId);
        const labels = p.eventIds
          .map((eid) => events.find((e) => e.id === eid)?.ceremonyType)
          .filter(Boolean) as string[];
        const days = Math.floor(
          (Date.now() - new Date(p.createdAt).getTime()) / 86400000
        );
        return {
          ...p,
          muaName: mua?.name ?? "?",
          muaPhone: mua?.phone ?? null,
          muaWhatsapp: mua?.whatsapp ?? null,
          muaCity: mua?.city ?? null,
          planTier: mua?.planTier ?? null,
          eventLabels: labels,
          daysSincePush: days,
        };
      }),
  checkCap: (
    muaId: string,
    leadId: string,
    urgencyBand: UrgencyBand,
    commissionPush = false
  ) => {
    const mua = muas.find((m) => m.id === muaId);
    const weeklyCap = mua?.planTier
      ? PLAN_CAPS[mua.planTier]
      : commissionPush
        ? 99
        : 0;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weeklyUsed = pushes.filter(
      (p) => p.muaId === muaId && new Date(p.createdAt) >= weekStart
    ).length;
    const leadActive = pushes.filter(
      (p) => p.leadId === leadId && !["closed", "booked"].includes(p.status)
    ).length;
    if (leadActive >= SLA.perLeadCap)
      return { allowed: false, requiresBypass: false, reason: `Per-lead cap (${SLA.perLeadCap}) reached` };
    if (weeklyUsed < weeklyCap)
      return { allowed: true, requiresBypass: false };
    if (urgencyBand === "critical")
      return { allowed: true, requiresBypass: true, reason: "Weekly cap exceeded — bypass required" };
    return { allowed: false, requiresBypass: false, reason: `Weekly cap ${weeklyUsed}/${weeklyCap}` };
  },
  createPush: (params: {
    leadId: string;
    muaId: string;
    eventIds: string[];
    prices: Record<string, number>;
    bypassReason?: string;
    actorId: string;
    actorName: string;
  }) => {
    const lead = leads.find((l) => l.id === params.leadId);
    if (lead && !canPushMuaToLead(lead)) {
      throw new Error(BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE);
    }
    const blocked = pushes.find(
      (p) =>
        p.leadId === params.leadId &&
        p.muaId === params.muaId &&
        ["active", "awaitingClose", "booked"].includes(p.status)
    );
    if (blocked) {
      throw new Error(
        "This MUA is already on this lead — see their push on the profile."
      );
    }
    const total = Object.values(params.prices).reduce((a, b) => a + b, 0);
    const push: MuaPush = {
      id: uid("push"),
      leadId: params.leadId,
      muaId: params.muaId,
      stage: "initialContact",
      status: "active",
      outcome: null,
      quotedTotal: total,
      eventIds: params.eventIds,
      bypassReason: params.bypassReason ?? null,
      pushedBy: params.actorId,
      closedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    pushes.push(push);
    const mua = muas.find((m) => m.id === params.muaId);
    addComm(
      params.leadId,
      params.bypassReason ? "capBypass" : "muaPushed",
      params.bypassReason
        ? `Cap bypass (${mua?.name}): ${params.bypassReason}`
        : `Pushed ${mua?.name} — Rs. ${total.toLocaleString("en-IN")}`,
      params.actorId,
      params.actorName,
      "regionalRm",
      params.muaId
    );
    const staffId = lead?.assignedRmId ?? params.actorId;
    if (lead) {
      const title = `Initial contact — ${mua?.name ?? "MUA"} / ${lead.brideName}`;
      tasks.push({
        id: uid("tk"),
        displayId: `TK-${tasks.length + 1}`,
        userId: staffId,
        staffId,
        leadId: params.leadId,
        pushId: push.id,
        taskType: "followUp",
        title,
        dueDate: addDaysISO(1),
        status: "pending",
        createdAt: "",
        updatedAt: "",
        leadName: lead.brideName,
        brideDisplayId: lead.displayId,
        muaName: mua?.name,
      });
      addComm(
        params.leadId,
        "note",
        `Task auto-created: ${title}`,
        params.actorId,
        params.actorName,
        "regionalRm",
        params.muaId
      );
    }
    return push;
  },
  updatePushStage: (
    pushId: string,
    stage: string,
    actorId: string,
    actorName: string,
    opts?: { followUpDate?: string; staffId?: string }
  ) => {
    const p = pushes.find((x) => x.id === pushId);
    if (!p) return;
    p.stage = stage as MuaPush["stage"];
    const mua = muas.find((m) => m.id === p.muaId);
    const lead = leads.find((l) => l.id === p.leadId);
    if (!lead) return;
    addComm(
      p.leadId,
      "stageUpdated",
      `Stage → ${stage}`,
      actorId,
      actorName,
      "regionalRm",
      p.muaId
    );
    if (p.status !== "active") return;

    const rule = STAGE_TASK_RULES[stage];
    const followUpDate = opts?.followUpDate?.trim();
    if (!followUpDate && !rule) return;

    const staffId = opts?.staffId ?? lead.assignedRmId;
    if (!staffId) return;

    for (const t of tasks) {
      if (t.status !== "pending" || !t.pushId || t.leadId !== p.leadId) continue;
      const tp = pushes.find((x) => x.id === t.pushId);
      if (tp?.muaId === p.muaId) t.status = "cancelled";
    }
    const dup = tasks.find((t) => {
      if (t.status !== "pending" || !t.pushId || t.leadId !== p.leadId) return false;
      const tp = pushes.find((x) => x.id === t.pushId);
      return tp?.muaId === p.muaId;
    });
    if (dup) return;

    const title = followUpDate
      ? `Follow up on ${mua?.name ?? "MUA"} — ${stage}`
      : rule!.title(mua?.name ?? "MUA", lead.brideName);
    const dueDate = followUpDate ?? addDaysISO(rule!.days);
    tasks.push({
      id: uid("tk"),
      displayId: `TK-${tasks.length + 1}`,
      userId: staffId,
      staffId,
      leadId: p.leadId,
      pushId,
      taskType: "followUp",
      title,
      dueDate,
      status: "pending",
      createdAt: "",
      updatedAt: "",
      leadName: lead.brideName,
      brideDisplayId: lead.displayId,
      muaName: mua?.name,
    });
    addComm(
      p.leadId,
      "note",
      `Task auto-created: ${title}`,
      actorId,
      actorName,
      "regionalRm",
      p.muaId
    );
  },
  updatePushQuotes: (
    pushId: string,
    prices: Record<string, number>,
    actorId: string,
    actorName: string
  ) => {
    const p = pushes.find((x) => x.id === pushId);
    if (!p) return;
    const total = Object.values(prices).reduce((a, b) => a + b, 0);
    p.quotedTotal = total;
    for (const [eventId, price] of Object.entries(prices)) {
      const pep = pushEventPrices.find(
        (x) => x.pushId === pushId && x.eventId === eventId
      );
      if (pep) pep.quotedPrice = price;
      else pushEventPrices.push({ id: uid("pep"), pushId, eventId, quotedPrice: price });
    }
    addComm(
      p.leadId,
      "note",
      `Quote updated — Rs. ${total.toLocaleString("en-IN")}`,
      actorId,
      actorName,
      "regionalRm",
      p.muaId
    );
  },
  closePush: (
    pushId: string,
    outcome: "notSelected" | "withdrew" | "notInterested",
    actorId: string,
    actorName: string
  ) => {
    const p = pushes.find((x) => x.id === pushId);
    if (!p) return;
    p.status = "closed";
    p.outcome = outcome;
    p.closedAt = new Date().toISOString();
    for (const t of tasks) {
      if (t.status !== "pending" || t.leadId !== p.leadId) continue;
      if (t.pushId === pushId) {
        t.status = "cancelled";
        continue;
      }
      const tp = t.pushId ? pushes.find((x) => x.id === t.pushId) : undefined;
      if (tp?.muaId === p.muaId) t.status = "cancelled";
    }
    addComm(
      p.leadId,
      "conversationClosed",
      `Closed: ${outcome}`,
      actorId,
      actorName,
      "regionalRm",
      p.muaId
    );
  },
  leadTracksCommission: (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return false;
    return !!lead.shiftedAt || lead.status === "commissionRm";
  },

  confirmBooking: (params: {
    leadId: string;
    eventId: string;
    pushId: string;
    bookedPrice: number;
    advancePaid?: number | null;
    fullPaid?: number | null;
    zohoInvoiceRef?: string | null;
    commissionAmount?: number | null;
    commissionPaid?: number | null;
    trackCommission?: boolean;
    actorId: string;
    actorName: string;
  }) => {
    const ev = events.find((e) => e.id === params.eventId);
    if (ev) {
      ev.status = "booked";
      ev.bookedPrice = params.bookedPrice;
      ev.muaId = pushes.find((p) => p.id === params.pushId)?.muaId ?? null;
    }
    const win = pushes.find((p) => p.id === params.pushId);
    const ceremonyLabel = ev?.ceremonyType ?? "event";
    if (win) {
      const openOnWin = win.eventIds.filter((eid) => {
        const e = events.find((x) => x.id === eid);
        return e && !["booked", "notNeeded"].includes(e.status);
      });
      win.status = openOnWin.length === 0 ? "booked" : "active";
    }
    pushes
      .filter(
        (p) =>
          p.leadId === params.leadId &&
          p.id !== params.pushId &&
          p.eventIds.includes(params.eventId) &&
          (p.status === "active" || p.status === "awaitingClose")
      )
      .forEach((p) => {
        const remaining = p.eventIds.filter((id) => id !== params.eventId);
        const muaName = muas.find((m) => m.id === p.muaId)?.name ?? "MUA";
        if (remaining.length === 0) {
          p.status = "closed";
          p.outcome = "notSelected";
          p.eventIds = [];
          p.closedAt = new Date().toISOString();
          for (const t of tasks) {
            if (t.pushId === p.id && t.status === "pending") t.status = "cancelled";
          }
          addComm(
            params.leadId,
            "conversationClosed",
            `Not selected for ${ceremonyLabel} — ${muaName}`,
            params.actorId,
            params.actorName,
            "regionalRm",
            p.muaId
          );
        } else {
          p.eventIds = remaining;
          p.status = "active";
          for (const t of tasks) {
            if (
              t.pushId === p.id &&
              t.taskType === "closeConversation" &&
              t.status === "pending"
            ) {
              t.status = "cancelled";
            }
          }
          addComm(
            params.leadId,
            "note",
            `${ceremonyLabel} booked with another MUA — ${muaName} continues for other ceremonies`,
            params.actorId,
            params.actorName,
            "regionalRm",
            p.muaId
          );
        }
      });
    addComm(
      params.leadId,
      "bookingConfirmed",
      `Booked ${ev?.ceremonyType ?? "event"} — Rs. ${params.bookedPrice.toLocaleString("en-IN")}`,
      params.actorId,
      params.actorName,
      "regionalRm"
    );
    const nowIso = new Date().toISOString();
    const bridePaid =
      (params.advancePaid ?? 0) + (params.fullPaid ?? 0) >= params.bookedPrice;
    const commDue = params.trackCommission ? params.commissionAmount ?? null : null;
    const commPaid = params.trackCommission ? params.commissionPaid ?? null : null;
    const leadRow = leads.find((l) => l.id === params.leadId);
    const isCommissionLead =
      !!leadRow?.shiftedAt || leadRow?.status === "commissionRm";
    const bookingDate = nowIso.slice(0, 10);
    const slaDate =
      isCommissionLead && commDue != null && (commPaid ?? 0) < commDue
        ? commissionSlaDueDate(bookingDate)
        : null;
    const bookingId = uid("bk");
    mockBookings.push({
      id: bookingId,
      leadId: params.leadId,
      eventId: params.eventId,
      muaId: win?.muaId ?? "",
      pushId: params.pushId,
      bookedPrice: params.bookedPrice,
      bookingDate,
      advancePaid: params.advancePaid ?? null,
      fullPaid: params.fullPaid ?? null,
      paymentMode: null,
      zohoInvoiceRef: params.zohoInvoiceRef ?? null,
      commissionAmount: commDue,
      commissionPaid: commPaid,
      commissionPaidAt:
        commDue != null && (commPaid ?? 0) >= commDue ? nowIso : (commPaid ?? 0) > 0 ? nowIso : null,
      commissionPaymentMode: null,
      brideFullyPaidAt: bridePaid ? nowIso : null,
      commissionNextFollowUpAt: slaDate,
      createdBy: params.actorId,
      createdAt: nowIso,
    });
    if (slaDate && leadRow) {
      const muaName = muas.find((m) => m.id === win?.muaId)?.name ?? "MUA";
      const staffId =
        users.find((u) => u.id === params.actorId && u.role === "commissionRm")?.id ??
        users.find((u) => u.role === "commissionRm" && u.active)?.id ??
        params.actorId;
      const overdueDate = commissionOverdueDate(bookingDate);
      for (const kind of ["sla", "overdue"] as const) {
        const dueDate = kind === "sla" ? slaDate : overdueDate;
        if (!dueDate) continue;
        const title = commissionCollectionTaskTitle(
          kind,
          bookingId,
          muaName,
          leadRow.brideName,
          ev?.ceremonyType ?? "event"
        );
        if (tasks.some((t) => t.status === "pending" && t.title === title)) continue;
        tasks.push({
          id: uid("tk"),
          displayId: `TK-${tasks.length + 1}`,
          userId: staffId,
          staffId,
          leadId: params.leadId,
          pushId: params.pushId,
          taskType: "followUp",
          title,
          dueDate,
          status: "pending",
          createdAt: nowIso,
          updatedAt: "",
          leadName: leadRow.brideName,
          brideDisplayId: leadRow.displayId,
        });
      }
    }
    if (params.trackCommission && commDue != null) {
      addComm(
        params.leadId,
        "note",
        `Commission from MUA: Rs. ${commDue.toLocaleString("en-IN")}${
          (commPaid ?? 0) >= commDue ? " — received" : " — pending"
        }`,
        params.actorId,
        params.actorName,
        "commissionRm"
      );
    }

    if (win) {
      const openOnWin = win.eventIds.filter((eid) => {
        const e = events.find((x) => x.id === eid);
        return e && !["booked", "notNeeded"].includes(e.status);
      }).length;
      if (openOnWin === 0) {
        cancelPendingMuaTasksMock(tasks, pushes, { pushId: params.pushId });
        for (const t of tasks) {
          if (t.pushId === params.pushId && t.status === "pending") {
            t.status = "cancelled";
          }
        }
      }
    }

    const pendingEvents = events.filter(
      (e) =>
        e.leadId === params.leadId &&
        !["booked", "notNeeded"].includes(e.status)
    ).length;
    const bookedEvents = events.filter(
      (e) => e.leadId === params.leadId && e.status === "booked"
    ).length;
    const fullyBooked = pendingEvents === 0 && bookedEvents > 0;

    if (fullyBooked) {
      for (const p of pushes) {
        if (
          p.leadId === params.leadId &&
          (p.status === "active" || p.status === "awaitingClose")
        ) {
          p.status = "closed";
          p.outcome = "notSelected";
          p.closedAt = p.closedAt ?? new Date().toISOString();
        }
      }
      for (const t of tasks) {
        if (t.leadId === params.leadId && t.status === "pending") {
          t.status = "cancelled";
        }
      }

      const activeBookings = mockBookings.filter(
        (b) => b.leadId === params.leadId && !b.cancelled
      );
      const financialRows = activeBookings.map((b) => ({
        bookedPrice: Number(b.bookedPrice),
        advancePaid: b.advancePaid,
        fullPaid: b.fullPaid,
        brideFullyPaidAt: b.brideFullyPaidAt,
        commissionAmount: b.commissionAmount,
        commissionPaid: b.commissionPaid,
      }));

      if (!allBookingsFinanciallySettled(financialRows)) {
        const actor = users.find((u) => u.id === params.actorId);
        const staffId = isCommissionLead
          ? actor?.role === "commissionRm"
            ? params.actorId
            : users.find((u) => u.role === "commissionRm" && u.active)?.id ??
              params.actorId
          : leadRow?.assignedRmId ?? params.actorId;
        const muaName = muas.find((m) => m.id === win?.muaId)?.name ?? "MUA";
        const title = buildPostBookingTaskTitle(
          muaName,
          leadRow?.brideName ?? "Lead",
          financialRows
        );
        tasks.push({
          id: uid("tk"),
          displayId: `TK-${tasks.length + 1}`,
          userId: staffId,
          staffId,
          leadId: params.leadId,
          pushId: params.pushId,
          taskType: "followUp",
          title,
          dueDate: addDaysISO(1),
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: "",
          leadName: leadRow?.brideName,
          brideDisplayId: leadRow?.displayId,
        });
        addComm(
          params.leadId,
          "note",
          `Task auto-created: ${title}`,
          params.actorId,
          params.actorName,
          isCommissionLead ? "commissionRm" : "regionalRm",
          win?.muaId
        );
      }
    }

    reconcileMockLeadStatus(params.leadId);
  },
  updateBookingPayment: (
    bookingId: string,
    body: {
      advancePaid?: number | null;
      fullPaid?: number | null;
      paymentMode?: import("./types").PaymentMode | null;
      zohoInvoiceRef?: string | null;
      commissionPaid?: number | null;
      commissionPaymentMode?: import("./types").PaymentMode | null;
      commissionAmount?: number | null;
      commissionNextFollowUpAt?: string | null;
      dismissBridePayment?: boolean;
    },
    session: { userId: string; name: string }
  ) => {
    const booking = mockBookings.find((b) => b.id === bookingId && !b.cancelled);
    if (!booking) return null;
    const advance =
      body.advancePaid !== undefined ? body.advancePaid : booking.advancePaid;
    const full =
      body.fullPaid !== undefined ? body.fullPaid : booking.fullPaid;
    const paid = (advance ?? 0) + (full ?? 0);
    const existingBrideTotal =
      (booking.advancePaid ?? 0) + (booking.fullPaid ?? 0);
    if (paid > Number(booking.bookedPrice)) {
      throw new Error("Advance + balance cannot exceed booked price");
    }
    if (paid < existingBrideTotal) {
      throw new Error("Recorded bride payment cannot be reduced");
    }
    if (body.commissionAmount != null) {
      if (body.commissionAmount < 0) throw new Error("Invalid commission due");
      booking.commissionAmount = body.commissionAmount;
    }
    const due = booking.commissionAmount ?? 0;
    const commissionFloor = booking.commissionPaid ?? 0;
    if (body.commissionPaid != null && body.commissionPaid < commissionFloor) {
      throw new Error("Commission received cannot be reduced");
    }
    if (body.commissionPaid != null && due > 0) {
      if (body.commissionPaid < 0 || body.commissionPaid > due) {
        throw new Error("Commission received cannot exceed commission due");
      }
    }
    booking.advancePaid =
      body.advancePaid !== undefined ? body.advancePaid : booking.advancePaid;
    booking.fullPaid =
      body.fullPaid !== undefined ? body.fullPaid : booking.fullPaid;
    booking.paymentMode =
      body.paymentMode !== undefined ? body.paymentMode : booking.paymentMode;
    if (body.commissionPaymentMode !== undefined) {
      booking.commissionPaymentMode = body.commissionPaymentMode;
    }
    booking.zohoInvoiceRef =
      body.zohoInvoiceRef !== undefined ? body.zohoInvoiceRef : booking.zohoInvoiceRef;
    const nowIso = new Date().toISOString();
    const brideTotal = (booking.advancePaid ?? 0) + (booking.fullPaid ?? 0);
    if (body.dismissBridePayment) {
      const due = booking.commissionAmount ?? 0;
      const paid =
        body.commissionPaid !== undefined
          ? body.commissionPaid ?? 0
          : booking.commissionPaid ?? 0;
      if (due > 0 && paid < due) {
        throw new Error(
          "Clear Olready commission before closing bride payment tracking"
        );
      }
      booking.brideFullyPaidAt = booking.brideFullyPaidAt ?? nowIso;
    } else if (brideTotal >= Number(booking.bookedPrice)) {
      booking.brideFullyPaidAt = booking.brideFullyPaidAt ?? nowIso;
    } else {
      booking.brideFullyPaidAt = null;
    }
    if (body.commissionPaid !== undefined) {
      booking.commissionPaid = body.commissionPaid;
      const due = booking.commissionAmount ?? 0;
      if ((booking.commissionPaid ?? 0) >= due && due > 0) {
        booking.commissionPaidAt = booking.commissionPaidAt ?? nowIso;
        booking.commissionNextFollowUpAt = null;
        for (const t of tasks) {
          if (
            t.leadId === booking.leadId &&
            t.status === "pending" &&
            t.title.includes(`[bk:${booking.id}]`)
          ) {
            t.status = "cancelled";
          }
        }
      }
    }
    if (body.commissionNextFollowUpAt !== undefined) {
      booking.commissionNextFollowUpAt = body.commissionNextFollowUpAt;
      if (body.commissionNextFollowUpAt) {
        const leadRow = leads.find((l) => l.id === booking.leadId);
        const muaName = muas.find((m) => m.id === booking.muaId)?.name ?? "MUA";
        const ev = events.find((e) => e.id === booking.eventId);
        const staffId =
          users.find((u) => u.id === session.userId && u.role === "commissionRm")?.id ??
          users.find((u) => u.role === "commissionRm" && u.active)?.id ??
          session.userId;
        const title = commissionCollectionTaskTitle(
          "follow_up",
          booking.id,
          muaName,
          leadRow?.brideName ?? "Lead",
          ev?.ceremonyType ?? "event"
        );
        for (const t of tasks) {
          if (
            t.leadId === booking.leadId &&
            t.status === "pending" &&
            t.title.includes(`[bk:${booking.id}]`) &&
            t.title.includes("follow-up")
          ) {
            t.status = "cancelled";
          }
        }
        tasks.push({
          id: uid("tk"),
          displayId: `TK-${tasks.length + 1}`,
          userId: staffId,
          staffId,
          leadId: booking.leadId,
          pushId: booking.pushId,
          taskType: "followUp",
          title,
          dueDate: body.commissionNextFollowUpAt,
          status: "pending",
          createdAt: nowIso,
          updatedAt: "",
          leadName: leadRow?.brideName,
          brideDisplayId: leadRow?.displayId,
        });
      }
    }
    const ev = events.find((e) => e.id === booking.eventId);
    addComm(
      booking.leadId,
      "note",
      `Payment updated for ${ev?.ceremonyType ?? "event"}: Rs. ${brideTotal.toLocaleString("en-IN")} collected${
        body.dismissBridePayment ? " (bride tracking closed)" : ""
      }`,
      session.userId,
      session.name,
      "regionalRm"
    );
    const activeBookings = mockBookings.filter(
      (b) => b.leadId === booking.leadId && !b.cancelled
    );
    const financialRows = activeBookings.map((b) => ({
      bookedPrice: Number(b.bookedPrice),
      advancePaid: b.advancePaid,
      fullPaid: b.fullPaid,
      brideFullyPaidAt: b.brideFullyPaidAt,
      commissionAmount: b.commissionAmount,
      commissionPaid: b.commissionPaid,
    }));
    if (allBookingsFinanciallySettled(financialRows)) {
      for (const t of tasks) {
        if (
          t.leadId === booking.leadId &&
          t.status === "pending" &&
          t.title.startsWith("Post-booking follow-up")
        ) {
          t.status = "cancelled";
        }
      }
    }
    return booking;
  },
  cancelBooking: (params: {
    bookingId: string;
    actorId: string;
    actorName: string;
    reason?: string;
  }) => {
    const booking = mockBookings.find(
      (b) => b.id === params.bookingId && !b.cancelled
    );
    if (!booking) return null;
    const ev = events.find((e) => e.id === booking.eventId);
    if (ev) {
      ev.status = "open";
      ev.bookedPrice = null;
      ev.muaId = null;
    }
    const win = pushes.find((p) => p.id === booking.pushId);
    if (win) {
      const openOnWin = win.eventIds.filter((eid) => {
        const e = events.find((x) => x.id === eid);
        return e && !["booked", "notNeeded"].includes(e.status);
      });
      if (openOnWin.length > 0 && win.status === "booked") win.status = "active";
    }
    const nowIso = new Date().toISOString();
    booking.cancelled = true;
    booking.cancelledAt = nowIso;
    booking.cancelReason = params.reason?.trim() || "Cancelled";
    for (const t of tasks) {
      if (
        t.leadId === booking.leadId &&
        t.status === "pending" &&
        t.title.startsWith("Post-booking follow-up")
      ) {
        t.status = "cancelled";
      }
    }
    const leadRow = leads.find((l) => l.id === booking.leadId);
    const muaName = muas.find((m) => m.id === booking.muaId)?.name ?? "MUA";
    const ceremonyLabel = ev?.ceremonyType ?? "event";
    const isCommissionLead = !!leadRow?.shiftedAt;
    const staffId = isCommissionLead
      ? users.find((u) => u.id === params.actorId && u.role === "commissionRm")
          ?.id ??
        users.find((u) => u.role === "commissionRm" && u.active)?.id ??
        params.actorId
      : leadRow?.assignedRmId ?? params.actorId;
    for (const t of tasks) {
      if (
        t.leadId === booking.leadId &&
        t.status === "pending" &&
        t.title.startsWith("Booking cancelled — follow up")
      ) {
        t.status = "cancelled";
      }
    }
    const cancelTitle = buildBookingCancelledTaskTitle(
      muaName,
      leadRow?.brideName ?? "Lead",
      ceremonyLabel
    );
    tasks.push({
      id: uid("tk"),
      displayId: `TK-${tasks.length + 1}`,
      userId: staffId,
      staffId,
      leadId: booking.leadId,
      pushId: booking.pushId,
      taskType: "followUp",
      title: cancelTitle,
      dueDate: addDaysISO(1),
      status: "pending",
      createdAt: nowIso,
      updatedAt: "",
      leadName: leadRow?.brideName,
      brideDisplayId: leadRow?.displayId,
    });
    addComm(
      booking.leadId,
      "note",
      `Task auto-created: ${cancelTitle}`,
      params.actorId,
      params.actorName,
      isCommissionLead ? "commissionRm" : "regionalRm",
      booking.muaId
    );
    addComm(
      booking.leadId,
      "note",
      `Booking cancelled: ${muaName} — ${ceremonyLabel}`,
      params.actorId,
      params.actorName,
      "regionalRm"
    );
    reconcileMockLeadStatus(booking.leadId);
    return { leadId: booking.leadId };
  },
  exitLead: (
    leadId: string,
    action: "not_interested" | "archive_not_interested" | "hostile",
    actorId: string,
    actorName: string,
    note?: string,
    actorRole: UserRole = "regionalRm",
    commissionRmId?: string
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    if (action === "not_interested" || action === "archive_not_interested") {
      const archiveDirect =
        action === "archive_not_interested" || actorRole === "commissionRm";
      if (archiveDirect) {
        if (actorRole === "commissionRm" && lead.status !== "commissionRm") return;
        if (
          actorRole === "regionalRm" &&
          (lead.status === "commissionRm" ||
            lead.status === "archived" ||
            lead.status === "booked")
        ) {
          return;
        }
        lead.status = "archived";
        const prior = lead.handoverReason?.trim();
        lead.handoverReason =
          prior && prior.toLowerCase().includes("not interested")
            ? prior
            : actorRole === "commissionRm"
              ? "Not interested — commission closed"
              : RM_NI_ARCHIVE_HANDOVER;
        lead.exitMarkedByRole = toDbExitMarkedByRole(actorRole);
        lead.uploaderConfirmation = null;
        lead.uploaderConfirmedAt = null;
        lead.uploaderConfirmedBy = null;
        addComm(
          leadId,
          "note",
          `Not interested — archived (${actorRole === "commissionRm" ? "Commission" : "RM"})`,
          actorId,
          actorName,
          actorRole
        );
      } else if (actorRole === "regionalRm") {
        if (lead.status === "commissionRm" || lead.status === "archived") return;
        const targetCommissionRmId =
          commissionRmId?.trim() || pickCommissionRmMock();
        if (!targetCommissionRmId) return;
        const commissionRm = users.find((u) => u.id === targetCommissionRmId);
        lead.status = "commissionRm";
        lead.assignedRmId = targetCommissionRmId;
        lead.assignmentDate = null;
        lead.handoverReason = "Not Interested in Plan MUAs";
        lead.exitMarkedByRole = toDbExitMarkedByRole(actorRole);
        lead.shiftedAt = new Date().toISOString();
        addComm(
          leadId,
          "shiftedCommission",
          `Not Interested in Plan MUAs — shifted to ${commissionRm?.name ?? "Commission RM"}`,
          actorId,
          actorName,
          "regionalRm"
        );
        scheduleCommissionHandoverTasksMock(
          leadId,
          lead.displayId,
          "Not Interested in Plan MUAs",
          targetCommissionRmId
        );
      }
    } else {
      lead.status = "archived";
      lead.hostileNote = note ?? "";
      lead.exitMarkedByRole = toDbExitMarkedByRole(actorRole);
      lead.uploaderConfirmation = null;
      lead.uploaderConfirmedAt = null;
      lead.uploaderConfirmedBy = null;
      addComm(
        leadId,
        "hostileFlagged",
        `Not answering: ${note ?? ""}`,
        actorId,
        actorName,
        actorRole
      );
    }
  },
  getVerificationConnectAttempts: (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    return lead?.verificationConnectAttempts ?? 0;
  },
  logVerificationConnectAttempt: (
    leadId: string,
    _actorId: string,
    _note?: string | null
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return null;
    const isPending = !lead.verified && lead.status === "pendingVerification";
    const isReview =
      lead.status === "archived" &&
      !lead.uploaderConfirmation &&
      ((lead.hostileNote?.trim().length ?? 0) > 0 ||
        (lead.handoverReason?.toLowerCase().includes("not interested") ?? false));
    if (!isPending && !isReview) return null;
    const attempts = (lead.verificationConnectAttempts ?? 0) + 1;
    lead.verificationConnectAttempts = attempts;
    return { attempts, canClose: attempts >= 2 };
  },
  verifyLead: (
    leadId: string,
    data: Partial<BrideLead> & {
      ceremonies: string[];
      ceremonyBudgets?: Array<{
        name: string;
        budget: number | null;
        date?: string | null;
        description?: string | null;
        location?: string | null;
        region?: Region | null;
      }>;
      assignmentRegion?: Region | null;
      verifiedViaCall?: boolean;
      verifiedViaWhatsapp?: boolean;
      talkedTo?: "bride" | "family" | "both";
      portalOnly?: boolean;
      portalPushed?: boolean;
      portalCap?: number | null;
      verifyOutcome?: "complete" | "not_interested_archive" | "not_answering_archive";
      exitNote?: string | null;
    },
    actorName: string,
    actorId: string
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return null;
    const markNi = data.verifyOutcome === "not_interested_archive";
    const markNotAnswering = data.verifyOutcome === "not_answering_archive";
    if (markNotAnswering) {
      Object.assign(lead, {
        status: "archived",
        hostileNote: data.exitNote ?? "Not answering",
        exitMarkedByRole: "lead_uploader",
        verified: false,
      });
      return lead;
    }
    const portalOnly = markNi ? false : !!data.portalOnly;
    const wasHostile = !!(lead.hostileNote?.trim() || lead.status === "archived");
    Object.assign(lead, data, {
      verified: true,
      status: markNi ? "archived" : "verified",
      verifiedAt: new Date().toISOString(),
      verifiedBy: actorId,
      portalOnly,
      portalPushed: markNi ? false : !!data.portalPushed,
      portalCap: data.portalCap ?? null,
      hostileNote: null,
      assignedRmId: null,
      assignmentDate: null,
      shiftedAt: null, ownerAssignedAt: null,
      handoverReason: markNi
        ? "Not interested in Olready services (uploader verification)"
        : null,
      uploaderConfirmation: markNi ? "confirmed_ni" : null,
      uploaderConfirmedAt: markNi ? new Date().toISOString() : null,
      uploaderConfirmedBy: markNi ? actorId : null,
      exitMarkedByRole: markNi ? "lead_uploader" : lead.exitMarkedByRole,
    });
    events = events.filter((e) => e.leadId !== leadId);
    const ceremonyRows: Array<{
      name: string;
      budget: number | null;
      date?: string | null;
      description?: string | null;
      location?: string | null;
      region?: Region | null;
    }> =
      data.ceremonyBudgets ??
      data.ceremonies?.map((name) => ({ name, budget: null as number | null })) ??
      [];
    const ceremonyInputs = ceremonyRows.map((c) => ({
      name: c.name,
      date: c.date ?? data.eventDate ?? lead.eventDate,
      location: c.location ?? null,
      region: c.region ?? null,
    }));
    const { region: primaryRegion } = deriveLeadPrimaryRegion({
      ceremonies: ceremonyInputs,
      assignmentRegion: data.assignmentRegion ?? null,
    });
    lead.region = primaryRegion;
    lead.eventLocation =
      leadEventLocationSummary(ceremonyInputs) || data.eventLocation || lead.eventLocation;
    ceremonyRows.forEach((c, i) => {
      const input = ceremonyInputs[i];
      events.push({
        id: uid("ev"),
        leadId,
        ceremonyType: c.name,
        eventDate: input.date ?? null,
        eventLocation: input.location ?? null,
        region: input.region ?? primaryRegion,
        status: "open",
        muaId: null,
        bookedPrice: null,
        budgetAmount: c.budget,
        description: c.description ?? null,
        createdAt: "",
        updatedAt: "",
      });
    });
    const { totalBudget, tier } = resolveLeadBudgetTier(
      ceremonyRows,
      mergeBudgetTierConfig(mockStore.getSla()).limits
    );
    if (totalBudget > 0) {
      lead.budgetAmount = totalBudget;
      lead.budgetTier = tier;
    }
    if (data.verifiedViaCall) {
      addComm(leadId, "callLogged", "Verification call completed", actorId, actorName, "leadUploader");
    }
    if (data.verifiedViaWhatsapp) {
      addComm(
        leadId,
        "whatsappLogged",
        "Verification WhatsApp confirmed",
        actorId,
        actorName,
        "leadUploader"
      );
    }
    const talked =
      data.talkedTo === "bride"
        ? "bride"
        : data.talkedTo === "family"
          ? "family member"
          : "bride and family member";
    const channels = [
      data.verifiedViaCall ? "call" : null,
      data.verifiedViaWhatsapp ? "WhatsApp" : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (markNi && data.exitNote) {
      addComm(
        leadId,
        "note",
        `Not interested & archive during verification: ${data.exitNote}`,
        actorId,
        actorName,
        "leadUploader"
      );
    }
    addComm(
      leadId,
      "leadVerified",
      markNi
        ? `Contact confirmed by ${actorName} via ${channels}. Spoke with ${talked}. Not interested — archived.`
        : `${wasHostile ? "Re-verified after not answering" : "Lead verified"} by ${actorName} via ${channels}. Spoke with ${talked}.`,
      actorId,
      actorName,
      "leadUploader"
    );
    if (!portalOnly && !markNi && SLA.autoAssignEnabled) {
      const rm = users.find(
        (u) => u.role === "regionalRm" && u.region === lead.region && u.active
      );
      if (rm) {
        lead.status = "assigned";
        lead.assignedRmId = rm.id;
        lead.assignmentDate = new Date().toISOString().slice(0, 10);
        addComm(leadId, "assigned", `Auto-assigned to ${rm.name}`, actorId, actorName, "leadUploader");
      }
    }
    return toLeadFull(lead);
  },
  importValidatedLeads: (
    rows: Array<{
      brideName: string;
      phone: string;
      email?: string | null;
      eventDate: string | null;
      city: string;
      region?: BrideLead["region"];
      eventLocation?: string | null;
      budgetAmount?: number | null;
      budgetTier?: BrideLead["budgetTier"];
      source?: string | null;
      ceremonies?: string[];
    }>,
    actor?: { id: string; name: string } | null,
  ) => {
    const nextLeadDisplayId = () => {
      const max = leads.reduce((m, l) => {
        const match = /^LD-(\d+)$/.exec(l.displayId);
        const n = match ? parseInt(match[1], 10) : 0;
        return n > m ? n : m;
      }, 0);
      return `LD-${String(max + 1).padStart(5, "0")}`;
    };
    let imported = 0;
    let merged = 0;
    let skipped = 0;
    const errors: string[] = [];
    const notices: string[] = [];
    const seenPhones = new Set<string>();
    for (const row of rows) {
      const phone = "phone" in row && typeof row.phone === "string" ? row.phone : "";
      const phoneKey = normalizePhone(phone);
      if (seenPhones.has(phoneKey)) {
        skipped++;
        errors.push(`Duplicate phone in file: ${phone}`);
        continue;
      }
      seenPhones.add(phoneKey);

      if (mockPhoneBlocksCreate(phone)) {
        skipped++;
        errors.push(`Active lead exists for ${phone}`);
        continue;
      }

      const existingPending = leads.find(
        (l) =>
          l.status === "pendingVerification" &&
          !l.verified &&
          normalizePhone(l.phone) === phoneKey,
      );
      if (existingPending) {
        Object.assign(existingPending, {
          brideName: row.brideName,
          phone: row.phone,
          email: row.email ?? existingPending.email,
          city: row.city,
          region: row.region ?? existingPending.region,
          eventLocation: row.eventLocation ?? existingPending.eventLocation,
          eventDate: row.eventDate || existingPending.eventDate,
          budgetAmount: row.budgetAmount ?? existingPending.budgetAmount,
          source: row.source ?? existingPending.source,
          updatedAt: new Date().toISOString(),
        });
        merged++;
        notices.push(`Merged into existing pending lead ${existingPending.displayId} (${phone})`);
        continue;
      }

      const id = uid("ld");
      const lead: BrideLead = {
        id,
        displayId: nextLeadDisplayId(),
        brideName: row.brideName,
        phone: row.phone,
        email: row.email ?? null,
        city: row.city,
        region: row.region ?? null,
        eventLocation: row.eventLocation ?? null,
        eventDate: row.eventDate || "",
        budgetAmount: row.budgetAmount ?? null,
        budgetTier:
          row.budgetAmount && row.budgetAmount > 0
            ? resolveLeadBudgetTier(
                [{ budget: row.budgetAmount }],
                mergeBudgetTierConfig(mockStore.getSla()).limits
              ).tier
            : row.budgetTier ?? "tier1",
        source: row.source ?? "Import",
        status: "pendingVerification",
        verified: false,
        verifiedAt: null,
        verifiedBy: null,
        assignedRmId: null,
        assignmentDate: null,
        shiftedAt: null, ownerAssignedAt: null,
        handoverReason: null,
        groupSize: 1,
        groupNotes: null,
        hostileNote: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      leads.push(lead);
      const ceremonies = row.ceremonies?.length ? row.ceremonies : ["Wedding"];
      for (const c of ceremonies) {
        events.push({
          id: uid("ev"),
          leadId: id,
          ceremonyType: c,
          eventDate: row.eventDate,
          status: "open",
          muaId: null,
          bookedPrice: null,
          createdAt: "",
          updatedAt: "",
        });
      }
      addComm(
        id,
        "leadCreated",
        actor
          ? `Lead imported by ${actor.name} — pending verification`
          : "Imported via lead wizard",
        actor?.id ?? null,
        actor?.name ?? "System",
      );
      imported++;
    }
    return { imported, merged, skipped, errors, notices };
  },
  createMua: (row: {
    name: string;
    city: string;
    phone?: string | null;
    regions?: Region[];
    bio?: string | null;
    services?: string[];
    whatsapp?: string | null;
    instagram?: string | null;
    planTier?: PlanTier | null;
    planExpiry?: string | null;
    status?: string;
  }) => {
    const regions = resolveMuaRegions(row.regions, row.city);
    const mua: Mua = {
      id: uid("mua"),
      displayId: `MUA-${String(muas.length + 1).padStart(4, "0")}`,
      name: row.name,
      phone: row.phone ?? null,
      city: row.city,
      regions: regions.length ? regions : ["north"],
      bio: row.bio ?? null,
      services: row.services ?? [],
      planTier: row.planTier ?? null,
      planExpiry: row.planExpiry ?? null,
      status: row.status ?? "active",
      whatsapp: row.whatsapp ?? null,
      instagram: row.instagram ?? null,
      specialties: [],
      assignedRmId: null,
      joinDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    muas.push(mua);
    return mua;
  },
  findMuaByPhone: mockFindMuaByPhone,
  importValidatedMuas: (
    rows: Array<{
      name: string;
      city: string;
      regions?: Region[];
      planTier?: PlanTier | null;
      planExpiry?: string | null;
    }>
  ) => {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const regions = resolveMuaRegions(row.regions, row.city);
      if (!regions.length) {
        skipped++;
        errors.push(`${row.name}: set region(s) or use a listed city`);
        continue;
      }
      muas.push({
        id: uid("mua"),
        displayId: `MUA-${String(muas.length + 1).padStart(4, "0")}`,
        name: row.name,
        city: row.city,
        regions,
        bio: null,
        services: [],
        planTier: row.planTier ?? null,
        planExpiry: row.planExpiry ?? null,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      imported++;
    }
    return { imported, skipped, errors };
  },
  getAdminMuas: () => {
    const weekStart = startOfWeekMonday();
    return muas.map((m) => {
      const weeklyCap = m.planTier ? PLAN_CAPS[m.planTier] : 0;
      const weeklyUsed = pushes.filter(
        (p) => p.muaId === m.id && new Date(p.createdAt) >= weekStart
      ).length;
      return {
        ...m,
        weeklyCap,
        weeklyUsed,
        assignedRmName: users.find((u) => u.id === m.assignedRmId)?.name ?? null,
        planRmName: users.find((u) => u.id === m.planRmId)?.name ?? null,
      };
    });
  },
  getAdminMuaPlanControlsDetail: (muaId: string) => {
    const m = muas.find((x) => x.id === muaId);
    if (!m) return null;
    const planRmOptions = users
      .filter((u) => u.role === "regionalRm")
      .map((u) => ({
        id: u.id,
        name: u.name,
        region: u.region ?? "north",
      }));
    return {
      planRmId: m.planRmId ?? null,
      planRmName: users.find((u) => u.id === m.planRmId)?.name ?? null,
      assignedRmId: m.assignedRmId ?? null,
      assignedRmName: users.find((u) => u.id === m.assignedRmId)?.name ?? null,
      rmSupport: null as boolean | null,
      leadReversal: null as boolean | null,
      pipelineId: null as string | null,
      regions: m.regions ?? [],
      planRmOptions,
    };
  },
  patchAdminMuaPlanControls: (
    muaId: string,
    body: {
      planExpiry?: string | null;
      weeklyCapOverride?: number | null;
      weeklyCapBonus?: number | null;
      adminPlanTag?: string | null;
      planRmId?: string | null;
      rmSupport?: boolean | null;
      leadReversal?: boolean | null;
    },
  ): boolean => {
    const m = muas.find((x) => x.id === muaId);
    if (!m) return false;
    if (body.planRmId !== undefined) {
      m.planRmId = body.planRmId?.trim() ? body.planRmId.trim() : null;
    }
    if (body.planExpiry !== undefined) m.planExpiry = body.planExpiry;
    return true;
  },
  importCsv: (rows: Record<string, string>[]) => {
    const created: BrideLead[] = [];
    rows.forEach((row) => {
      const id = uid("ld");
      const lead: BrideLead = {
        id,
        displayId: `LD-${String(leads.length + 1).padStart(5, "0")}`,
        brideName: row.bride_name ?? row.name ?? "Unknown",
        phone: row.phone ?? "",
        email: row.email ?? null,
        city: row.city ?? "Delhi",
        region: (row.region as BrideLead["region"]) ?? "north",
        eventLocation: row.event_location ?? null,
        eventDate: row.event_date ?? "2026-12-01",
        budgetAmount: Number(row.budget) || null,
        budgetTier: (row.budget_tier as BrideLead["budgetTier"]) ?? "tier3",
        source: row.source ?? "CSV",
        status: "pendingVerification",
        verified: false,
        verifiedAt: null,
        verifiedBy: null,
        assignedRmId: null,
        assignmentDate: null,
        shiftedAt: null, ownerAssignedAt: null,
        handoverReason: null,
        groupSize: 1,
        groupNotes: null,
        hostileNote: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      leads.push(lead);
      created.push(lead);
      addComm(id, "leadCreated", "Imported via CSV", null, "System");
    });
    return created;
  },
  assignLeads: (leadIds: string[], rmId: string, actorName: string) => {
    const rm = users.find((u) => u.id === rmId);
    leadIds.forEach((lid) => {
      const lead = leads.find((l) => l.id === lid);
      if (!lead) return;
      lead.assignedRmId = rmId;
      lead.assignmentDate = new Date().toISOString().slice(0, 10);
      lead.status = "assigned";
      (lead as BrideLead & { portalOnly?: boolean }).portalOnly = false;
      addComm(lid, "assigned", `Assigned to ${rm?.name}`, "u-admin", actorName, "admin");
    });
  },
  getUnassignedLeads: () =>
    leads
      .filter(
        (l) =>
          l.verified &&
          !l.assignedRmId &&
          l.status === "verified" &&
          !(l as BrideLead & { portalOnly?: boolean }).portalOnly
      )
      .map(toLeadFull),
  getPortalLeads: () =>
    leads
      .filter(
        (l) =>
          (l as BrideLead & { portalOnly?: boolean }).portalOnly &&
          l.status === "verified" &&
          !l.assignedRmId
      )
      .map(toLeadFull),
  claimPortalLead: (leadId: string, rmId: string, rmName: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || !(lead as BrideLead & { portalOnly?: boolean }).portalOnly) {
      return null;
    }
    if (lead.assignedRmId) return null;
    lead.assignedRmId = rmId;
    lead.assignmentDate = new Date().toISOString().slice(0, 10);
    lead.status = "commissionRm";
    (lead as BrideLead & { portalOnly?: boolean }).portalOnly = false;
    addComm(
      leadId,
      "assigned",
      `Claimed from portal leads by ${rmName}`,
      rmId,
      rmName,
      "commissionRm"
    );
    return toLeadFull(lead);
  },
  getRegionalRms: () =>
    users.filter((u) => u.role === "regionalRm").map((u) => ({
      id: u.id,
      name: u.name,
      region: u.region!,
    })),
  getTasks: (userId: string) =>
    tasks
      .filter(
        (t) =>
          (t.userId === userId || t.staffId === userId) && t.status === "pending"
      )
      .map((t) => {
        const push = t.pushId ? pushes.find((p) => p.id === t.pushId) : null;
        const mua = push ? muas.find((m) => m.id === push.muaId) : null;
        const lead = t.leadId ? leads.find((l) => l.id === t.leadId) : null;
        return {
          ...t,
          leadName: t.leadName ?? lead?.brideName,
          brideDisplayId: t.brideDisplayId ?? lead?.displayId,
          muaName: mua?.name,
          muaPhone: mua?.whatsapp ?? null,
          muaWhatsapp: mua?.whatsapp ?? null,
          muaCity: mua?.city ?? null,
          leadPhone: lead?.phone ?? null,
          leadRegion: lead?.region ?? null,
          muaId: mua?.id ?? push?.muaId ?? null,
          pushStage: push?.stage ?? null,
        };
      }),
  getFinancialBookingsForTask: (taskId: string, userId: string) => {
    const t = tasks.find(
      (x) =>
        x.id === taskId &&
        (x.userId === userId || x.staffId === userId) &&
        x.status === "pending"
    );
    if (!t || !isFinancialFollowUpTask({ taskType: t.taskType, title: t.title })) {
      return [];
    }
    if (!t.leadId) return [];
    const lead = leads.find((l) => l.id === t.leadId);
    const active = mockBookings.filter((b) => b.leadId === t.leadId && !b.cancelled);
    if (isPostBookingFollowUpTitle(t.title)) {
      return active.map((b) => {
        const ev = events.find((e) => e.id === b.eventId);
        const mua = muas.find((m) => m.id === b.muaId);
        return mockFinancialBookingSnapshot(
          b,
          lead,
          ev?.ceremonyType ?? "event",
          mua?.name ?? "MUA"
        );
      });
    }
    const bookingId = parseCommissionBookingIdFromTitle(t.title);
    if (!bookingId) return [];
    const b = active.find((x) => x.id === bookingId);
    if (!b) return [];
    const ev = events.find((e) => e.id === b.eventId);
    const mua = muas.find((m) => m.id === b.muaId);
    return [
      mockFinancialBookingSnapshot(
        b,
        lead,
        ev?.ceremonyType ?? "event",
        mua?.name ?? "MUA"
      ),
    ];
  },
  completeTask: (
    taskId: string,
    payload?: {
      note: string;
      stage?: string;
      nextFollowUpDate?: string;
      financialUpdates?: Array<{
        bookingId: string;
        advancePaid?: number | null;
        fullPaid?: number | null;
        paymentMode?: import("./types").PaymentMode | null;
        zohoInvoiceRef?: string | null;
        commissionPaid?: number | null;
        commissionAmount?: number | null;
        dismissBridePayment?: boolean;
      }>;
    }
  ) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) throw new Error("Task not found");
    const note = payload?.note?.trim() ?? "";
    if (note.length < 10) throw new Error("Completion notes must be at least 10 characters");

    const financialFollowUp = isFinancialFollowUpTask({
      taskType: t.taskType,
      title: t.title,
    });
    const needsPush = taskRequiresPushCompletion(t.taskType, t.pushId, t.title);

    if (needsPush) {
      if (!payload?.stage) throw new Error("Stage is required");
      if (!payload?.nextFollowUpDate) throw new Error("Next follow-up date is required");
    }

    t.status = "done";

    if (financialFollowUp && t.leadId) {
      const actor = users.find((u) => u.id === (t.staffId ?? t.userId));
      if (payload?.financialUpdates?.length) {
        for (const item of payload.financialUpdates) {
          const { bookingId, ...patch } = item;
          const hasPatch = Object.values(patch).some((v) => v !== undefined);
          if (!hasPatch) continue;
          mockStore.updateBookingPayment(
            bookingId,
            patch,
            { userId: t.staffId ?? t.userId, name: actor?.name ?? "RM" }
          );
        }
      }
      addComm(
        t.leadId,
        "note",
        `Payment follow-up (${t.title}): ${note}`,
        t.staffId ?? t.userId,
        actor?.name,
        actor?.role ?? "regionalRm",
        t.muaId ?? undefined
      );
      if (payload?.nextFollowUpDate?.trim()) {
        const lead = leads.find((l) => l.id === t.leadId);
        const push = t.pushId ? pushes.find((p) => p.id === t.pushId) : undefined;
        const mua = push ? muas.find((m) => m.id === push.muaId) : undefined;
        const activeBookings = mockBookings.filter(
          (b) => b.leadId === t.leadId && !b.cancelled
        );
        const financialRows = activeBookings.map((b) => ({
          bookedPrice: Number(b.bookedPrice),
          advancePaid: b.advancePaid,
          fullPaid: b.fullPaid,
          brideFullyPaidAt: b.brideFullyPaidAt,
          commissionAmount: b.commissionAmount,
          commissionPaid: b.commissionPaid,
        }));
        if (
          t.title.startsWith("Post-booking follow-up") &&
          !allBookingsFinanciallySettled(financialRows)
        ) {
          for (const other of tasks) {
            if (
              other.leadId === t.leadId &&
              other.status === "pending" &&
              other.title.startsWith("Post-booking follow-up")
            ) {
              other.status = "cancelled";
            }
          }
          const title = buildPostBookingTaskTitle(
            mua?.name ?? "MUA",
            lead?.brideName ?? "Lead",
            financialRows
          );
          tasks.push({
            id: uid("tk"),
            displayId: `TK-${tasks.length + 1}`,
            userId: t.userId,
            staffId: t.staffId ?? t.userId,
            leadId: t.leadId,
            pushId: t.pushId,
            taskType: "followUp",
            title,
            dueDate: payload.nextFollowUpDate.trim(),
            status: "pending",
            createdAt: "",
            updatedAt: "",
            leadName: lead?.brideName,
            brideDisplayId: lead?.displayId,
            muaName: mua?.name,
          });
        }
      }
    } else if (needsPush && t.pushId) {
      const push = pushes.find((p) => p.id === t.pushId);
      if (!push) throw new Error("Push not found");
      const mua = muas.find((m) => m.id === push.muaId);
      const lead = leads.find((l) => l.id === push.leadId);
      if (!lead) throw new Error("Lead not found");

      push.stage = payload!.stage as (typeof push)["stage"];
      const actor = users.find((u) => u.id === (t.staffId ?? t.userId));
      addComm(
        push.leadId,
        "stageUpdated",
        note,
        t.staffId ?? t.userId,
        actor?.name,
        "regionalRm",
        push.muaId
      );

      if (push.status === "active") {
        for (const other of tasks) {
          if (other.id === t.id || other.status !== "pending" || !other.pushId) continue;
          if (other.leadId !== push.leadId) continue;
          const op = pushes.find((x) => x.id === other.pushId);
          if (op?.muaId === push.muaId) other.status = "cancelled";
        }
        const title = `Follow up — ${mua?.name ?? "MUA"} / ${lead.brideName}`;
        tasks.push({
          id: uid("tk"),
          displayId: `TK-${tasks.length + 1}`,
          userId: t.userId,
          staffId: t.staffId ?? t.userId,
          leadId: push.leadId,
          pushId: t.pushId,
          taskType: "followUp",
          title,
          dueDate: payload!.nextFollowUpDate!,
          status: "pending",
          createdAt: "",
          updatedAt: "",
          leadName: lead.brideName,
          brideDisplayId: lead.displayId,
          muaName: mua?.name,
        });
      }
    } else if (t.leadId) {
      const actor = users.find((u) => u.id === (t.staffId ?? t.userId));
      addComm(
        t.leadId,
        "note",
        `Task completed (${t.title}): ${note}`,
        t.staffId ?? t.userId,
        actor?.name,
        "regionalRm"
      );
    }
  },
  getRmMuas: (region: Region): RmMuaRosterItem[] => {
    const monday = startOfWeekMonday();
    return muas
      .filter((m) => {
        if (!m.planTier || m.status !== "active") return false;
        const hasPushInRegion = pushes.some((p) => {
          const bl = leads.find((l) => l.id === p.leadId);
          return p.muaId === m.id && bl?.region === region;
        });
        return muaMatchesRegion(m, region, hasPushInRegion);
      })
      .map((m) => {
        const weeklyCap = m.planTier ? PLAN_CAPS[m.planTier] : 0;
        const weeklyUsed = pushes.filter(
          (p) => p.muaId === m.id && new Date(p.createdAt) >= monday
        ).length;
        const weeklyRemaining = Math.max(0, weeklyCap - weeklyUsed);
        const muaPushes = pushes.filter((p) => p.muaId === m.id);
        const last = muaPushes.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        )[0];
        return {
          id: m.id,
          displayId: m.displayId,
          name: m.name,
          city: m.city,
          planTier: m.planTier!,
          planExpiry: m.planExpiry,
          weeklyCap,
          weeklyUsed,
          weeklyRemaining,
          activeConversations: muaPushes.filter((p) => p.status === "active").length,
          awaitingClose: muaPushes.filter((p) => p.status === "awaitingClose")
            .length,
          totalBookings: 0,
          totalPushesAllTime: muaPushes.length,
          lastPushed: last?.createdAt ?? null,
        };
      });
  },
  getRmMuasForRegions: (regions: Region[]): RmMuaRosterItem[] => {
    const seen = new Set<string>();
    const merged: RmMuaRosterItem[] = [];
    for (const region of regions) {
      for (const m of mockStore.getRmMuas(region)) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        merged.push(m);
      }
    }
    return merged;
  },
  getRmMyPlanMuas: (staffId: string): RmMuaRosterItem[] => {
    const monday = startOfWeekMonday();
    return muas
      .filter((m) => m.planRmId === staffId && m.planTier && m.status === "active")
      .map((m) => {
        const weeklyCap = m.planTier ? PLAN_CAPS[m.planTier] : 0;
        const weeklyUsed = pushes.filter(
          (p) => p.muaId === m.id && new Date(p.createdAt) >= monday
        ).length;
        const weeklyRemaining = Math.max(0, weeklyCap - weeklyUsed);
        const muaPushes = pushes.filter((p) => p.muaId === m.id);
        const last = muaPushes.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        )[0];
        return {
          id: m.id,
          displayId: m.displayId,
          name: m.name,
          city: m.city,
          planTier: m.planTier!,
          planExpiry: m.planExpiry,
          weeklyCap,
          weeklyUsed,
          weeklyRemaining,
          activeConversations: muaPushes.filter((p) => p.status === "active").length,
          awaitingClose: muaPushes.filter((p) => p.status === "awaitingClose")
            .length,
          totalBookings: 0,
          totalPushesAllTime: muaPushes.length,
          lastPushed: last?.createdAt ?? null,
        };
      });
  },
  getCommissionMuas: (opts?: { regions?: Region[] }): RmMuaRosterItem[] => {
    const monday = startOfWeekMonday();
    return muas
      .filter((m) => m.status === "active")
      .filter((m) => {
        if (!opts?.regions?.length) return true;
        return opts.regions.some((region) => {
          const hasPush = pushes.some((p) => {
            if (p.muaId !== m.id) return false;
            const lead = leads.find((l) => l.id === p.leadId);
            return lead?.region === region;
          });
          return muaMatchesRegion(
            { regions: m.regions, city: m.city },
            region,
            hasPush
          );
        });
      })
      .map((m) => {
        const weeklyCap = m.planTier ? PLAN_CAPS[m.planTier] : 0;
        const weeklyUsed = pushes.filter(
          (p) => p.muaId === m.id && new Date(p.createdAt) >= monday
        ).length;
        const weeklyRemaining = m.planTier
          ? Math.max(0, weeklyCap - weeklyUsed)
          : 0;
        const muaPushes = pushes.filter((p) => p.muaId === m.id);
        const last = muaPushes.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        )[0];
        return {
          id: m.id,
          displayId: m.displayId,
          name: m.name,
          city: m.city,
          phone: m.phone ?? null,
          whatsapp: m.whatsapp ?? null,
          adminPlanTag: null,
          salesPipelineId: null,
          regions: m.regions ?? resolveMuaRegions(m.regions, m.city),
          planTier: m.planTier,
          planExpiry: m.planExpiry,
          weeklyCap,
          weeklyUsed,
          weeklyRemaining,
          activeConversations: muaPushes.filter((p) => p.status === "active").length,
          awaitingClose: muaPushes.filter((p) => p.status === "awaitingClose")
            .length,
          totalBookings: 0,
          totalPushesAllTime: muaPushes.length,
          lastPushed: last?.createdAt ?? null,
        };
      });
  },
  getMuaComms: (muaId: string) => {
    const rows = comms
      .filter((c) => c.muaId === muaId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
    return rows.map((c) => {
      const lead = leads.find((l) => l.id === c.leadId);
      return {
        id: c.id,
        leadId: c.leadId,
        entryType: c.entryType,
        description: c.description,
        actorId: c.actorId,
        metadata: c.metadata,
        createdAt: c.createdAt,
        leadName: lead?.brideName ?? "—",
        leadDisplayId: lead?.displayId ?? "—",
      };
    });
  },
  getDashboard: () => {
    const activeLeads = leads.filter((l) =>
      ["assigned", "commissionRm"].includes(l.status)
    ).length;
    const commissionPipeline = leads.filter((l) => l.status === "commissionRm").length;
    const criticalBand = leads
      .map(toLeadFull)
      .filter((l) => l.urgencyBand === "critical" && l.status === "assigned").length;
    const approachingShift = leads
      .map(toLeadFull)
      .filter((l) => (l.daysSinceAssignment ?? 0) >= SLA.shiftWarningDay).length;
    const bookingsMtd = 4;
    const regionalRms = users.filter((u) => u.role === "regionalRm");
    const commissionRms = users.filter((u) => u.role === "commissionRm");
    const staffPortfolio = [
      ...regionalRms.map((u) => ({
        id: u.id,
        name: u.name,
        role: "regional_rm" as const,
        region: u.region ?? null,
        activeLeads: leads.filter((l) => l.assignedRmId === u.id && l.status === "assigned").length,
        bookedMtd: leads.filter((l) => l.assignedRmId === u.id && l.status === "booked").length > 0 ? 1 : 0,
        pushesMtd: pushes.filter((p) => p.pushedBy === u.id).length,
        criticalUntouched: 1,
        pendingConfirmation: 0,
        overdueTasks: 0,
        bypassesWeek: pushes.filter((p) => p.bypassReason && p.pushedBy === u.id).length,
        conversionRate: 22,
        hasCallyzer: true,
        callsMtd: 42,
        talkMinutesMtd: 180,
        lastCallAt: new Date().toISOString(),
        daysSinceLastCall: 0,
      })),
      ...commissionRms.map((u) => ({
        id: u.id,
        name: u.name,
        role: "commission_rm" as const,
        region: u.region ?? null,
        activeLeads: leads.filter((l) => l.assignedRmId === u.id && l.status === "commissionRm").length,
        bookedMtd: 0,
        pushesMtd: pushes.filter((p) => p.pushedBy === u.id).length,
        criticalUntouched: 0,
        pendingConfirmation: 1,
        overdueTasks: 0,
        bypassesWeek: 0,
        conversionRate: 18,
        hasCallyzer: true,
        callsMtd: 28,
        talkMinutesMtd: 95,
        lastCallAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        daysSinceLastCall: 4,
      })),
    ];
    return {
      kpis: {
        activeLeads,
        commissionPipeline,
        criticalBand,
        approachingShift,
        bookingsMtd,
        activeLeadsDelta: 2,
        bookingsMtdDelta: 1,
        criticalBandDelta: null,
        approachingShiftDelta: null,
      },
      staffPortfolio,
      summary: {
        regionalRmCount: regionalRms.length,
        commissionRmCount: commissionRms.length,
        commissionLeads: commissionPipeline,
        callyzer: {
          mappedStaff: regionalRms.length + commissionRms.length,
          callsMtd: 70,
          talkMinutesMtd: 275,
          staleStaff: 1,
          lastSyncAt: new Date().toISOString(),
        },
      },
      callyzer: {
        mappedStaff: regionalRms.length + commissionRms.length,
        callsMtd: 70,
        talkMinutesMtd: 275,
        staleStaff: 1,
        lastSyncAt: new Date().toISOString(),
      },
      rmPortfolio: staffPortfolio
        .filter((s) => s.role === "regional_rm")
        .map((s) => ({
          id: s.id,
          name: s.name,
          region: s.region ?? "",
          activeLeads: s.activeLeads,
          criticalUntouched: s.criticalUntouched,
          bypassesWeek: s.bypassesWeek,
          conversionRate: s.conversionRate,
        })),
    };
  },
  addCommEntry: (
    leadId: string,
    entryType: CommEntry["entryType"],
    description: string,
    actorId: string,
    actorName: string
  ) => addComm(leadId, entryType, description, actorId, actorName, "regionalRm"),

  addEvent: (
    leadId: string,
    payload: {
      ceremonyType: string;
      eventDate: string;
      eventLocation: string;
      region: import("./types").Region | null;
      budgetAmount?: number | null;
      description?: string | null;
    }
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) throw new Error("Lead not found");
    const name = payload.ceremonyType.trim();
    if (
      events.some(
        (e) =>
          e.leadId === leadId &&
          e.ceremonyType.trim().toLowerCase() === name.toLowerCase()
      )
    ) {
      throw new Error("This ceremony is already on the lead");
    }
    const region =
      payload.region ?? lead.region ?? null;
    if (!region) throw new Error("Region is required");
    events.push({
      id: uid("ev"),
      leadId,
      ceremonyType: name,
      eventDate: payload.eventDate,
      eventLocation: payload.eventLocation,
      region,
      status: "open",
      muaId: null,
      bookedPrice: null,
      budgetAmount: payload.budgetAmount ?? null,
      description: payload.description ?? null,
      createdAt: "",
      updatedAt: "",
    });
  },

  markEventNotNeeded: (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (ev) ev.status = "notNeeded";
  },

  softCheckin: (
    leadId: string,
    outcome: "olready" | "external" | "unknown",
    note: string | undefined,
    actorId: string,
    actorName: string
  ) => {
    const desc =
      outcome === "olready"
        ? "Soft check-in: Booked via Olready"
        : outcome === "external"
          ? `Soft check-in: Booked externally${note ? ` — ${note}` : ""}`
          : "Soft check-in: Unknown — marked missed";
    addComm(leadId, "softCheckin", desc, actorId, actorName, "regionalRm");
    if (outcome === "unknown") {
      const lead = leads.find((l) => l.id === leadId);
      if (lead) lead.status = "missed";
    }
  },

  reviewUploadLead: (
    leadId: string,
    action: "close_lead" | "move_to_not_interested" | "move_to_archived" | "confirm_ni" | "flag_rm_error",
    note: string | null,
    actorId: string
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return false;
    if (
      action === "close_lead" ||
      action === "move_to_not_interested" ||
      action === "move_to_archived" ||
      action === "confirm_ni"
    ) {
      lead.status = "archived";
      lead.hostileNote = null;
      lead.handoverReason = lead.handoverReason ?? "Closed by lead uploader";
      lead.uploaderConfirmation = "confirmed_ni";
      lead.uploaderConfirmedAt = new Date().toISOString();
      lead.uploaderConfirmedBy = actorId;
      lead.exitMarkedByRole = lead.exitMarkedByRole ?? "lead_uploader";
    } else if (action === "flag_rm_error") {
      return false;
    }
    if (note) {
      addComm(leadId, "note", `${LEAD_EXIT_LABELS.closeLead}: ${note}`, actorId, "Uploader", "leadUploader");
    }
    return true;
  },

  reactivateNiLead: (
    leadId: string,
    actorId: string,
    actorName: string,
    note: string | null
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return false;
    const ni = (lead.handoverReason ?? "").toLowerCase().includes("not interested");
    const hostile = !!(lead.hostileNote?.trim());
    const deactivated = (lead.handoverReason ?? "").toLowerCase().includes("deactivated");
    if (hostile) return false;
    if (!lead.verified) return false;
    if (lead.status !== "archived" && lead.status !== "commissionRm") return false;
    if (!ni && !deactivated && !lead.uploaderConfirmation) return false;

    lead.status = "verified";
    lead.verified = true;
    lead.handoverReason = null;
    lead.hostileNote = null;
    lead.shiftedAt = null;
    lead.assignedRmId = null;
    lead.assignmentDate = null;
    lead.portalOnly = false;
    lead.exitMarkedByRole = null;
    lead.uploaderConfirmation = "reopen";
    lead.uploaderConfirmedAt = new Date().toISOString();
    lead.uploaderConfirmedBy = actorId;
    const noteSuffix = note?.trim() ? `: ${note.trim()}` : "";
    addComm(
      leadId,
      "note",
      `${LEAD_EXIT_LABELS.reactivate} by ${actorName}${noteSuffix}`,
      actorId,
      actorName,
      "leadUploader"
    );
    return true;
  },

  getUploadLeads: (
    tab: "pending" | "verified" | "review" | "closed",
    filters?: {
      searchQ?: string | null;
      routing?: VerifiedRoutingFilter;
      rmId?: string | null;
      eventFrom?: string | null;
      eventTo?: string | null;
      excludeExpired?: boolean;
      excludeBooked?: boolean;
      state?: string | null;
      exitSource?: import("./lead-exit").ExitSourceFilter;
      connectAttemptsReview?: import("./upload-pending-filters").UploadConnectAttemptFilter;
      pendingSort?: import("./upload-pending-filters").UploadPendingSort;
      reviewSort?: import("./upload-pending-filters").UploadPendingSort;
      connectAttempts?: import("./upload-pending-filters").UploadConnectAttemptFilter;
    }
  ) => {
    const isReviewLead = (l: (typeof leads)[number]) =>
      l.status === "archived" &&
      !l.uploaderConfirmation &&
      ((l.hostileNote?.trim().length ?? 0) > 0 ||
        (l.handoverReason?.toLowerCase().includes("not interested") ?? false));

    const isClosedLead = (l: (typeof leads)[number]) =>
      l.status === "archived" &&
      (l.uploaderConfirmation != null ||
        (l.handoverReason?.toLowerCase().includes("deactivated") ?? false) ||
        ((l.handoverReason?.toLowerCase().includes("not interested") ?? false) &&
          !(l.hostileNote?.trim().length ?? 0)));

    if (tab === "review") {
      let rows = leads.filter(isReviewLead);
      if (filters?.exitSource && filters.exitSource !== "all") {
        rows = rows.filter((l) => {
          const role =
            l.exitMarkedByRole ??
            ((l.hostileNote?.trim().length ?? 0) > 0
              ? "regional_rm"
              : l.handoverReason?.toLowerCase().includes("plan mua")
                ? "regional_rm"
                : "commission_rm");
          return role === filters.exitSource;
        });
      }
      if (filters?.connectAttemptsReview && filters.connectAttemptsReview !== "all") {
        const n = Number(filters.connectAttemptsReview);
        rows = rows.filter((l) => (l.verificationConnectAttempts ?? 0) === n);
      }
      if (filters?.state) {
        rows = rows.filter((l) => {
          const city = l.city?.toLowerCase() ?? "";
          if (filters.state === "Delhi") return city.includes("delhi");
          if (filters.state === "Maharashtra") return city.includes("mumbai");
          if (filters.state === "Rajasthan") return city.includes("jaipur");
          return true;
        });
      }
      rows.sort((a, b) => {
        const cmp = (a.updatedAt || a.createdAt || "").localeCompare(
          b.updatedAt || b.createdAt || ""
        );
        return filters?.reviewSort === "oldest" ? cmp : -cmp;
      });
      const q = filters?.searchQ?.trim();
      if (q) {
        const digits = q.replace(/\D/g, "");
        rows = rows.filter(
          (l) =>
            l.brideName.toLowerCase().includes(q.toLowerCase()) ||
            l.city.toLowerCase().includes(q.toLowerCase()) ||
            l.phone.includes(q) ||
            (digits.length > 0 && l.phone.replace(/\D/g, "").includes(digits))
        );
      }
      return rows;
    }
    if (tab === "closed") {
      let rows = leads.filter(isClosedLead);
      const q = filters?.searchQ?.trim();
      if (q) {
        const digits = q.replace(/\D/g, "");
        rows = rows.filter(
          (l) =>
            l.brideName.toLowerCase().includes(q.toLowerCase()) ||
            l.city.toLowerCase().includes(q.toLowerCase()) ||
            l.phone.includes(q) ||
            (digits.length > 0 && l.phone.replace(/\D/g, "").includes(digits))
        );
      }
      return rows;
    }
    if (tab === "pending") {
      let rows = leads.filter(
        (l) =>
          !l.verified &&
          (l.status === "pendingVerification" ||
            (l.status === "expired" && !l.verifiedAt))
      );
      if (filters?.connectAttempts && filters.connectAttempts !== "all") {
        const n = Number(filters.connectAttempts);
        rows = rows.filter((l) => (l.verificationConnectAttempts ?? 0) === n);
      }
      if (filters?.state) {
        rows = rows.filter((l) => {
          const city = l.city?.toLowerCase() ?? "";
          if (filters.state === "Delhi") return city.includes("delhi");
          if (filters.state === "Maharashtra") return city.includes("mumbai");
          if (filters.state === "Rajasthan") return city.includes("jaipur");
          return true;
        });
      }
      rows.sort((a, b) => {
        const cmp = (a.createdAt || "").localeCompare(b.createdAt || "");
        return filters?.pendingSort === "oldest" ? cmp : -cmp;
      });
      return rows;
    }
    let rows = leads.filter(
      (l) =>
        l.verified &&
        l.status !== "pendingVerification" &&
        l.status !== "archived"
    );
    if (tab !== "verified") return rows;
    if (filters?.excludeExpired !== false) {
      rows = rows.filter((l) => l.status !== "expired");
    }
    if (filters?.excludeBooked !== false) {
      rows = rows.filter((l) => l.status !== "booked");
    }
    if (filters?.state) {
      rows = rows.filter((l) => {
        const city = l.city?.toLowerCase() ?? "";
        if (filters.state === "Delhi") return city.includes("delhi");
        if (filters.state === "Maharashtra") return city.includes("mumbai");
        if (filters.state === "Rajasthan") return city.includes("jaipur");
        return true;
      });
    }
    if (filters?.routing && filters.routing !== "all") {
      rows = rows.filter((l) =>
        matchesVerifiedRoutingFilter(l as BrideLead & { portalOnly?: boolean }, filters.routing!)
      );
    }
    if (filters?.rmId) {
      rows = rows.filter((l) => l.assignedRmId === filters.rmId);
    }
    if (filters?.eventFrom) {
      rows = rows.filter((l) => l.eventDate >= filters.eventFrom!);
    }
    if (filters?.eventTo) {
      rows = rows.filter((l) => l.eventDate <= filters.eventTo!);
    }
    const q = filters?.searchQ?.trim();
    if (q) {
      const digits = q.replace(/\D/g, "");
      rows = rows.filter(
        (l) =>
          l.brideName.toLowerCase().includes(q.toLowerCase()) ||
          l.city.toLowerCase().includes(q.toLowerCase()) ||
          l.phone.includes(q) ||
          (digits.length > 0 && l.phone.replace(/\D/g, "").includes(digits))
      );
    }
    return rows;
  },
  getLeadsByPhoneHistory: (
    phone: string,
    excludeLeadId?: string | null
  ): PhoneLeadHistoryRow[] => {
    const normalized = normalizePhone(phone);
    if (normalized.length < 10) return [];

    return leads
      .filter(
        (l) =>
          normalizePhone(l.phone) === normalized &&
          (!excludeLeadId || l.id !== excludeLeadId)
      )
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 8)
      .map((l) => {
        const leadComms = comms
          .filter((c) => c.leadId === l.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const rm = users.find((u) => u.id === l.assignedRmId);
        const pushCount = pushes.filter((p) => p.leadId === l.id).length;
        return {
          id: l.id,
          displayId: l.displayId,
          brideName: l.brideName,
          phone: l.phone,
          city: l.city,
          region: l.region,
          eventDate: l.eventDate || null,
          status: l.status,
          verified: l.verified,
          portalOnly: false,
          handoverReason: l.handoverReason,
          hostileNote: l.hostileNote,
          assignedRmName: rm?.name ?? null,
          createdAt: l.createdAt || "",
          updatedAt: l.updatedAt || "",
          commCount: leadComms.length,
          bookingCount: 0,
          pushCount,
          lastActivityAt: leadComms[0]?.createdAt ?? null,
          exitKind: exitKindFromRow({
            status: l.status,
            hostileNote: l.hostileNote,
            handoverReason: l.handoverReason,
          }),
          recentComms: leadComms.slice(0, 5).map((c) => ({
            entryType: c.entryType,
            description: c.description,
            actorName: c.actorName ?? null,
            createdAt: c.createdAt,
          })),
        };
      });
  },
  muaInRegionMock: (muaId: string, region: Region) => {
    const m = muas.find((x) => x.id === muaId);
    if (!m) return false;
    const hasPushInRegion = pushes.some((p) => {
      const bl = leads.find((l) => l.id === p.leadId);
      return p.muaId === muaId && bl?.region === region;
    });
    return muaMatchesRegion(m, region, hasPushInRegion);
  },
  getMuaDetail: (muaId: string): MuaDetailProfile | null => {
    const m = muas.find((x) => x.id === muaId);
    if (!m) return null;
    const monday = startOfWeekMonday();
    const muaPushes = pushes.filter((p) => p.muaId === muaId);
    const weeklyUsed = muaPushes.filter(
      (p) => new Date(p.createdAt) >= monday
    ).length;
    const weeklyCap = m.planTier ? PLAN_CAPS[m.planTier] : 0;
    const totalPushes = muaPushes.length;
    const totalBookings = 0;
    return {
      ...m,
      regions: m.regions ?? [],
      specialties: m.specialties ?? [],
      services: m.services ?? [],
      weeklyCap,
      monthlyPushTarget: m.planTier ? (m.planTier === "highestPrivy" ? 200 : 28) : null,
      planTierName: m.planTier ? PLAN_TIER_LABELS[m.planTier] : null,
      assignedRmName: users.find((u) => u.id === m.assignedRmId)?.name ?? null,
      planRmName: users.find((u) => u.id === m.planRmId)?.name ?? null,
      totalPushes,
      activePushes: muaPushes.filter((p) => p.status === "active").length,
      totalBookings,
      weeklyUsed,
      conversionPct: totalPushes ? Math.round((totalBookings / totalPushes) * 1000) / 10 : 0,
    };
  },
  getMuaPushes: (muaId: string, region: Region | null): MuaPushLeadRow[] => {
    return pushes
      .filter((p) => p.muaId === muaId)
      .map((p) => {
        const lead = leads.find((l) => l.id === p.leadId);
        const full = lead ? toLeadFull(lead) : null;
        return {
          id: p.id,
          stage: p.stage,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          leadId: p.leadId,
          displayId: lead?.displayId ?? "—",
          brideName: lead?.brideName ?? "—",
          budgetTier: lead?.budgetTier ?? "tier3",
          urgencyBand: full?.urgencyBand ?? "active",
          eventDate: lead?.eventDate ?? "",
          rmName: full?.assignedRmName ?? null,
        };
      })
      .filter((row) => !region || leads.find((l) => l.id === row.leadId)?.region === region)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  getMuaPlanHistory: (muaId: string) =>
    planHistory
      .filter((h) => h.muaId === muaId)
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
  getPipelineHealth: (opts: {
    region?: string;
    tier?: string;
    tiers?: string[];
    eventFrom?: string;
    eventTo?: string;
    session: { role: string; userId: string; region: string | null };
  }): PipelineHealthLead[] => {
    const excluded = new Set([
      "booked",
      "archived",
      "missed",
      "pendingVerification",
    ]);
    let list = leads.filter((l) => {
      if (excluded.has(l.status)) return false;
      if (opts.session.role === "commissionRm" && l.status !== "commissionRm")
        return false;
      if (opts.session.role === "regionalRm") {
        if (l.status !== "assigned" || l.assignedRmId !== opts.session.userId)
          return false;
        if (opts.region && l.region !== opts.region) return false;
      }
      const tierFilter = opts.tiers?.length ? opts.tiers : opts.tier ? [opts.tier] : [];
      if (tierFilter.length && !tierFilter.includes(l.budgetTier)) return false;
      if (opts.eventFrom && l.eventDate < opts.eventFrom) return false;
      if (opts.eventTo && l.eventDate > opts.eventTo) return false;
      return true;
    });
    return list.map((l) => {
      const count = new Set(
        pushes.filter((p) => p.leadId === l.id).map((p) => p.muaId)
      ).size;
      let bucket: PipelineHealthBucket = "none";
      if (count >= 16) bucket = "16+";
      else if (count >= 11) bucket = "11-15";
      else if (count >= 6) bucket = "6-10";
      else if (count >= 1) bucket = "1-5";
      return { ...toLeadFull(l), muasOfferedCount: count, bucket };
    });
  },
  updateMua: (id: string, patch: Partial<Mua> & { notes?: string | null }) => {
    const i = muas.findIndex((m) => m.id === id);
    if (i < 0) return null;
    const prev = muas[i];
    if (patch.planTier !== undefined && patch.planTier !== prev.planTier) {
      planHistory.push({
        id: uid("mph"),
        muaId: id,
        planTier: patch.planTier,
        assignedBy: "u-admin",
        assignedAt: new Date().toISOString(),
        expiryAt: patch.planExpiry ?? null,
        notes: patch.notes ?? null,
        assignedByName: "Vikram Singh",
      });
    }
    muas[i] = {
      ...muas[i],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return mockStore.getMuaDetail(id);
  },
  bulkReassign: (leadIds: string[], rmId: string, _actorId: string) => {
    let n = 0;
    for (const id of leadIds) {
      const i = leads.findIndex((l) => l.id === id);
      if (i >= 0) {
        leads[i] = {
          ...leads[i],
          assignedRmId: rmId,
          updatedAt: new Date().toISOString(),
        };
        n++;
      }
    }
    return n;
  },
  bulkNotInterested: (leadIds: string[], actorId: string, actorName: string) => {
    let n = 0;
    for (const id of leadIds) {
      const i = leads.findIndex((l) => l.id === id);
      const commissionRmId = pickCommissionRmMock();
      if (i >= 0 && commissionRmId) {
        const commissionRm = users.find((u) => u.id === commissionRmId);
        leads[i] = {
          ...leads[i]!,
          status: "commissionRm",
          assignedRmId: commissionRmId,
          assignmentDate: null,
          shiftedAt: new Date().toISOString(),
          ownerAssignedAt: new Date().toISOString(),
          handoverReason: "Not interested — bulk action",
          exitMarkedByRole: "regional_rm",
          updatedAt: new Date().toISOString(),
        };
        addComm(
          id,
          "shiftedCommission",
          `Not interested — bulk action by ${actorName} → ${commissionRm?.name ?? "Commission RM"}`,
          actorId,
          actorName,
          "regionalRm"
        );
        scheduleCommissionHandoverTasksMock(
          id,
          leads[i]!.displayId,
          "Not interested — bulk action",
          commissionRmId
        );
        n++;
      }
    }
    return n;
  },
  updateCommissionFollowUp: (
    leadId: string,
    body: {
      commissionOffered?: number | null;
      commissionAgreed?: number | null;
    },
    actorId: string,
    actorName: string
  ) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status !== "commissionRm") return null;
    if (body.commissionOffered !== undefined) {
      (lead as LeadFull).commissionOffered = body.commissionOffered;
    }
    if (body.commissionAgreed !== undefined) {
      (lead as LeadFull).commissionAgreed = body.commissionAgreed;
    }
    const parts: string[] = [];
    if (body.commissionOffered !== undefined) {
      parts.push(
        `Commission offered: ${body.commissionOffered != null ? `Rs. ${body.commissionOffered}` : "cleared"}`
      );
    }
    if (body.commissionAgreed !== undefined) {
      parts.push(
        `Commission agreed: ${body.commissionAgreed != null ? `Rs. ${body.commissionAgreed}` : "cleared"}`
      );
    }
    if (parts.length) {
      addComm(leadId, "note", parts.join(". "), actorId, actorName, "commissionRm");
    }
    return toLeadFull(lead);
  },
  createManualLead: (params: {
    brideName: string;
    phone: string;
    email?: string;
    city: string;
    region: Region;
    eventLocation?: string;
    eventDate: string;
    budgetAmount?: number;
    budgetTier?: BrideLead["budgetTier"];
    source?: string;
    groupSize?: number;
    groupNotes?: string;
    ceremonies: Array<{ name: string; budget: number | null }>;
    portalOnly?: boolean;
    portalPushed?: boolean;
    portalCap?: number | null;
    actorId: string;
    actorName: string;
  }) => {
    const id = uid("ld");
    const displayId = `LD-${String(leads.length + 1).padStart(5, "0")}`;
    const { totalBudget, tier } = resolveLeadBudgetTier(
      params.ceremonies,
      mergeBudgetTierConfig(mockStore.getSla()).limits
    );
    const lead: BrideLead = {
      id,
      displayId,
      brideName: params.brideName,
      phone: params.phone,
      email: params.email ?? null,
      city: params.city,
      region: params.region,
      eventLocation: params.eventLocation ?? null,
      eventDate: params.eventDate,
      budgetAmount: totalBudget > 0 ? totalBudget : params.budgetAmount ?? null,
      budgetTier:
        totalBudget > 0 ? tier : params.budgetTier ?? "tier1",
      source: params.source ?? null,
      status: "verified",
      verified: true,
      verifiedAt: new Date().toISOString(),
      verifiedBy: params.actorId,
      assignedRmId: null,
      assignmentDate: null,
      shiftedAt: null, ownerAssignedAt: null,
      handoverReason: null,
      groupSize: params.groupSize ?? null,
      groupNotes: params.groupNotes ?? null,
      hostileNote: null,
      portalPushed: !!params.portalPushed,
      portalCap: params.portalCap ?? null,
      portalOnly: !!params.portalOnly,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    leads.push(lead);
    for (const c of params.ceremonies) {
      events.push({
        id: uid("ev"),
        leadId: id,
        ceremonyType: c.name,
        eventDate: params.eventDate,
        status: "open",
        muaId: null,
        bookedPrice: null,
        budgetAmount: c.budget,
        createdAt: "",
        updatedAt: "",
      });
    }
    addComm(id, "leadCreated", `Lead manually added by ${params.actorName}`, params.actorId, params.actorName, "admin");
    return toLeadFull(lead);
  },
  createUploaderLead: (params: {
    brideName: string;
    phone: string;
    email?: string;
    city: string;
    region?: Region | null;
    eventLocation?: string;
    eventDate?: string | null;
    budgetAmount?: number;
    budgetTier?: BrideLead["budgetTier"];
    source?: string;
    groupSize?: number;
    groupNotes?: string;
    ceremonies: string[];
    actorId: string;
    actorName: string;
  }) => {
    if (mockPhoneBlocksCreate(params.phone)) {
      throw new Error("DUPLICATE_PHONE");
    }
    const id = uid("ld");
    const displayId = `LD-${String(leads.length + 1).padStart(5, "0")}`;
    const lead: BrideLead = {
      id,
      displayId,
      brideName: params.brideName,
      phone: params.phone,
      email: params.email ?? null,
      city: params.city,
      region: params.region ?? null,
      eventLocation: params.eventLocation ?? null,
      eventDate: params.eventDate ?? "",
      budgetAmount: params.budgetAmount ?? null,
      budgetTier: params.budgetTier ?? "tier1",
      source: params.source ?? null,
      status: "pendingVerification",
      verified: false,
      verifiedAt: null,
      verifiedBy: null,
      assignedRmId: null,
      assignmentDate: null,
      shiftedAt: null, ownerAssignedAt: null,
      handoverReason: null,
      groupSize: params.groupSize ?? null,
      groupNotes: params.groupNotes ?? null,
      hostileNote: null,
      portalPushed: false,
      portalCap: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    leads.push(lead);
    for (const c of params.ceremonies) {
      events.push({
        id: uid("ev"),
        leadId: id,
        ceremonyType: c,
        eventDate: params.eventDate ?? "",
        status: "open",
        muaId: null,
        bookedPrice: null,
        createdAt: "",
        updatedAt: "",
      });
    }
    addComm(
      id,
      "leadCreated",
      `Lead added by ${params.actorName} — pending verification`,
      params.actorId,
      params.actorName,
      "leadUploader"
    );
    return toLeadFull(lead);
  },
  updateLeadPortal: (leadId: string, pushed: boolean, cap: number | null) => {
    const i = leads.findIndex((l) => l.id === leadId);
    if (i < 0) return;
    leads[i] = {
      ...leads[i],
      portalPushed: pushed,
      portalPushedAt: pushed ? new Date().toISOString() : null,
      portalCap: cap,
    };
  },
  createTask: (params: {
    staffId: string;
    leadId: string;
    pushId?: string;
    taskType: string;
    title: string;
    dueDate?: string;
  }) => {
    if (params.pushId) {
      const ref = pushes.find((p) => p.id === params.pushId);
      const dup = tasks.find((t) => {
        if (t.status !== "pending" || !t.pushId || t.leadId !== params.leadId) return false;
        const tp = pushes.find((p) => p.id === t.pushId);
        return ref && tp?.muaId === ref.muaId;
      });
      if (dup) {
        const mua = ref ? muas.find((m) => m.id === ref.muaId) : null;
        throw new Error(
          `A pending task already exists${mua ? ` for ${mua.name}` : ""} on this lead (${dup.displayId}). Complete or update that task first.`
        );
      }
    }
    const task: Task = {
      id: uid("tk"),
      displayId: `TK-${tasks.length + 1}`,
      userId: params.staffId,
      staffId: params.staffId,
      leadId: params.leadId,
      pushId: params.pushId ?? null,
      taskType: "followUp",
      title: params.title,
      dueDate: params.dueDate ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tasks.push(task);
    return task;
  },
  search: (q: string, session: { role: User["role"]; region: Region | null }) => {
    const needle = q.toLowerCase();
    const match = (s: string) => s.toLowerCase().includes(needle);
    let leadList = leads.map(toLeadFull).filter(
      (l) =>
        l.status !== "archived" &&
        (match(l.brideName) || match(l.displayId) || match(l.phone))
    );
    if (session.role === "regionalRm" && session.region) {
      leadList = leadList.filter((l) => l.region === session.region);
    }
    if (session.role === "commissionRm") {
      leadList = leadList.filter((l) => l.status === "commissionRm");
    }
    const muaList =
      session.role === "salesRm" || session.role === "salesTl"
        ? []
        : muas
            .filter((m) => m.status === "active" && (match(m.name) || match(m.displayId)))
            .map((m) => ({
              id: m.id,
              displayId: m.displayId,
              name: m.name,
              city: m.city,
              planTier: m.planTier,
            }));
    return {
      leads: leadList.slice(0, 3).map((l) => ({
        id: l.id,
        displayId: l.displayId,
        brideName: l.brideName,
        phone: l.phone,
        city: l.city,
        budgetTier: l.budgetTier,
        urgencyBand: l.urgencyBand,
        status: l.status,
      })),
      muas: muaList.slice(0, 2),
    };
  },
    getReports: () => ({
    leads: leads.map(toLeadFull),
    comms: [...comms].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    staleThresholdHours: 48,
    inactiveCriticalHot: [] as {
      id: string;
      brideName: string;
      urgencyBand: string;
      hoursSince: number;
    }[],
    rmPerformance: [
      {
        rmId: "u-kanika",
        rmName: "Kanika",
        region: "north",
        totalActive: 12,
        totalBooked: 4,
        totalShifted: 2,
        conversionPct: 33.3,
        avgPushesPerLead: 2.1,
        staleLeads: 1,
      },
      {
        rmId: "u-rm-north",
        rmName: "Priya Sharma",
        region: "north",
        totalActive: 8,
        totalBooked: 1,
        totalShifted: 1,
        conversionPct: 12.5,
        avgPushesPerLead: 1.4,
        staleLeads: 3,
      },
    ],
  }),
  getAnalytics: () => ({
    volumeByWeek: [
      { week: "W1", tier1: 2, tier2: 5, tier3: 8 },
      { week: "W2", tier1: 3, tier2: 4, tier3: 6 },
      { week: "W3", tier1: 1, tier2: 6, tier3: 9 },
    ],
    conversionByRegion: [
      { region: "North", rate: 28 },
      { region: "West", rate: 22 },
      { region: "South", rate: 19 },
      { region: "East", rate: 15 },
    ],
    lossAttribution: [
      { name: "Booked", value: 12 },
      { name: "45-day Shift", value: 8 },
      { name: "Not Interested", value: 15 },
      { name: "Active", value: 42 },
      { name: "Archived", value: 6 },
    ],
    muaUtilisation: muas
      .filter((m) => m.planTier)
      .map((m) => {
        const cap = PLAN_CAPS[m.planTier!];
        const used = pushes.filter((p) => p.muaId === m.id).length % (cap + 1);
        return { name: m.name, tier: PLAN_TIER_LABELS[m.planTier!], pushes: used, cap };
      }),
    bookingRevenueByMonth: [
      { month: "Dec 25", revenue: 420000, bookings: 3 },
      { month: "Jan 26", revenue: 680000, bookings: 5 },
      { month: "Feb 26", revenue: 510000, bookings: 4 },
      { month: "Mar 26", revenue: 890000, bookings: 6 },
      { month: "Apr 26", revenue: 720000, bookings: 5 },
      { month: "May 26", revenue: 950000, bookings: 7 },
    ],
    leadSourceBreakdown: [
      { source: "Instagram", total: 42, booked: 12, conversionPct: 28.6 },
      { source: "Referral", total: 28, booked: 9, conversionPct: 32.1 },
      { source: "Website", total: 19, booked: 2, conversionPct: 10.5 },
    ],
    tierFunnel: [
      { budgetTier: "tier_1", verified: 18, assigned: 12, booked: 5 },
      { budgetTier: "tier_2", verified: 24, assigned: 16, booked: 4 },
      { budgetTier: "tier_3", verified: 31, assigned: 20, booked: 3 },
    ],
    rmLeaderboard: [
      { rmName: "Kanika", region: "north", conversionPct: 33.3, totalBooked: 4 },
      { rmName: "Priya Sharma", region: "north", conversionPct: 12.5, totalBooked: 1 },
    ],
  }),

  getTargets: (month: string) =>
    users
      .filter((u) => u.role === "regionalRm" || u.role === "commissionRm")
      .map((u) => {
        const t = rmTargets[`${u.id}:${month}`];
        const monthPushes = pushes.filter((p) => p.pushedBy === u.id);
        const worked = new Set(monthPushes.map((p) => p.leadId)).size;
        const role = u.role === "commissionRm" ? "commission_rm" : "regional_rm";
        const actualBookings = leads.filter(
          (l) => l.assignedRmId === u.id && l.status === "booked",
        ).length;
        const conversionPct =
          worked > 0 ? Math.round((actualBookings / worked) * 1000) / 10 : 0;
        return {
          staffId: u.id,
          staffName: u.name,
          role,
          region: u.region ?? null,
          targetBookings: t?.targetBookings ?? null,
          targetLeadsWorked: t?.targetLeadsWorked ?? null,
          targetAvgMuasPerLead: t?.targetAvgMuasPerLead ?? null,
          targetCommission: t?.targetCommission ?? null,
          notes: t?.notes ?? null,
          actualBookings,
          actualPushCount: monthPushes.length,
          actualLeadsWorked: worked,
          actualAvgMuasPerLead: worked > 0 ? 2.4 : 0,
          actualCommissionCollected: role === "commission_rm" ? 125000 : 0,
          conversionPct,
        };
      }),

  setTarget: (input: {
    staffId: string;
    month: string;
    targetBookings: number;
    targetLeadsWorked: number;
    targetAvgMuasPerLead: number;
    targetCommission?: number | null;
    notes: string | null;
  }) => {
    rmTargets[`${input.staffId}:${input.month}`] = input;
  },

  getMyTargets: (userId: string) => {
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = mockStore.getTargets(month).find((r) => r.staffId === userId);
    return {
      targetBookings: row?.targetBookings ?? null,
      targetLeadsWorked: row?.targetLeadsWorked ?? null,
      targetAvgMuasPerLead: row?.targetAvgMuasPerLead ?? null,
      actualBookings: row?.actualBookings ?? 0,
      actualLeadsWorked: row?.actualLeadsWorked ?? 0,
      actualAvgMuasPerLead: row?.actualAvgMuasPerLead ?? 0,
    };
  },

  getLeadJourney: (_filters: Record<string, string | null>) => {
    const journeyLeads = leads.slice(0, 20).map((l) => ({
      id: l.id,
      displayId: l.displayId,
      brideName: l.brideName,
      rmName: users.find((u) => u.id === l.assignedRmId)?.name ?? null,
      region: l.region,
      budgetTier: l.budgetTier,
      status: l.status,
      eventDate: l.eventDate,
      source: l.source ?? null,
      urgencyBand: "active",
      totalMuasOffered: pushes.filter((p) => p.leadId === l.id).length,
      totalPushes: pushes.filter((p) => p.leadId === l.id).length,
      bookingsCount: l.status === "booked" ? 1 : 0,
      tCreated: l.createdAt,
      tVerified: l.createdAt,
      tAssigned: l.createdAt,
      tFirstPush: l.createdAt,
      tOfferSent: null,
      tNegotiating: null,
      tBooked: l.status === "booked" ? l.createdAt : null,
      tShifted: l.status === "commissionRm" ? l.createdAt : null,
      tConfirmed: null,
      confirmationStatus: "pending",
      intakeProfilesCount: pushes.filter((p) => p.leadId === l.id).length,
      leadPhase: null,
      portalOnly: false,
      lastContactAt: null,
    }));
    return {
      leads: journeyLeads,
      summary: {
        funnel: [
          { stage: "Created", reached: journeyLeads.length, avgDaysFromPrev: null },
          { stage: "Verified", reached: journeyLeads.length, avgDaysFromPrev: 1 },
          { stage: "Assigned", reached: 15, avgDaysFromPrev: 2 },
          { stage: "First Push", reached: 12, avgDaysFromPrev: 1 },
          { stage: "Offer Sent", reached: 8, avgDaysFromPrev: 3 },
          { stage: "Booked", reached: 4, avgDaysFromPrev: 5 },
        ],
        stats: [
          { label: "Created→Verified", median: 1, p90: 2, avg: 1.2 },
          { label: "Verified→Assigned", median: 2, p90: 4, avg: 2.5 },
        ],
        bottleneck: { label: "Verified→Assigned", avg: 2.5 },
      },
    };
  },

  getIntakePerformance: (filters: { staffId?: string | null; region?: string | null }) => {
    const staffId = filters.staffId ?? null;
    const rmUsers = users.filter(
      (u) =>
        (u.role === "regionalRm" || u.role === "commissionRm") &&
        u.active &&
        (!staffId || u.id === staffId)
    );
    const summary = rmUsers.map((u) => ({
      staffId: u.id,
      staffName: u.name,
      role: u.role === "commissionRm" ? "commission_rm" : "regional_rm",
      region: u.region ?? null,
      pendingConfirmation: leads.filter(
        (l) => l.assignedRmId === u.id && l.status === "assigned"
      ).length,
      awaitingProfiles: 0,
      intakeGateComplete: 0,
      overdueIntakeTasks: tasks.filter(
        (t) =>
          t.staffId === u.id &&
          t.status === "pending" &&
          ["brideConfirmation", "shareProfiles", "leadProgressFollowUp"].includes(
            t.taskType
          )
      ).length,
      pendingIntakeTasks: tasks.filter(
        (t) =>
          t.staffId === u.id &&
          t.status === "pending" &&
          ["brideConfirmation", "shareProfiles", "leadProgressFollowUp"].includes(
            t.taskType
          )
      ).length,
    }));
    const leadRows = leads
      .filter((l) => !staffId || l.assignedRmId === staffId)
      .slice(0, 10)
      .map((l) => ({
        leadId: l.id,
        displayId: l.displayId,
        brideName: l.brideName,
        region: l.region,
        status: l.status,
        confirmationStatus: "pending",
        intakeProfilesCount: pushes.filter((p) => p.leadId === l.id).length,
        intakeGateComplete: false,
        confirmationAttempts: 0,
        pendingTaskType: null,
        pendingTaskTitle: null,
        pendingTaskDue: null,
        assignedRmName: users.find((u) => u.id === l.assignedRmId)?.name ?? null,
        daysSinceAssignment: null,
        daysToConfirm: null,
      }));
    return { summary, leads: leadRows };
  },

  getFinancialReport: (_filters: {
    dateFrom?: string | null;
    dateTo?: string | null;
    incomeType?: string;
    segmentBy?: string;
  }) => ({
    summary: {
      salesCollected: 125000,
      salesPayments: 8,
      commissionCollected: 45000,
      commissionDue: 62000,
      commissionOutstanding: 17000,
      bookingGmv: 380000,
    },
    breakdown: [
      { key: "u1", label: "Kanika", amount: 80000, count: 5, meta: "regional_rm" },
      { key: "u2", label: "Commission RM", amount: 45000, count: 3, meta: "commission_rm" },
    ],
    details: [
      {
        id: "pr-1",
        date: "2026-06-15",
        incomeType: "sales" as const,
        amount: 25000,
        label: "Glamocracy",
        staffName: "Sales RM",
        plan: "Phoenix",
        region: "Jaipur",
        brideName: null,
        leadDisplayId: null,
      },
    ],
    incomeType: _filters.incomeType ?? "sales",
    segmentBy: _filters.segmentBy ?? "user",
  }),

  getBackendTeamTasks: (filters: {
    staffId?: string | null;
    role?: string | null;
    region?: string | null;
    taskType?: string | null;
    due?: string | null;
    status?: string | null;
    search?: string | null;
  }) => {
    const rmTasks = tasks.filter((t) => {
      const u = users.find((x) => x.id === t.staffId);
      if (!u || (u.role !== "regionalRm" && u.role !== "commissionRm")) return false;
      if (filters.staffId && t.staffId !== filters.staffId) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.taskType && t.taskType !== filters.taskType) return false;
      return t.status === (filters.status ?? "pending");
    });
    return {
      stats: {
        pending: rmTasks.length,
        overdue: 1,
        dueToday: 2,
        byRole: [
          { role: "regional_rm", pending: rmTasks.length, overdue: 1 },
        ],
      },
      tasks: rmTasks.slice(0, 20).map((t) => {
        const u = users.find((x) => x.id === t.staffId);
        const lead = leads.find((l) => l.id === t.leadId);
        const push = pushes.find((p) => p.id === t.pushId);
        const mua = push ? muas.find((m) => m.id === push.muaId) : null;
        return {
          id: t.id,
          displayId: t.displayId,
          title: t.title,
          taskType: t.taskType,
          status: t.status,
          dueDate: t.dueDate,
          createdAt: t.createdAt,
          staffId: t.staffId,
          staffName: u?.name ?? "RM",
          staffRole: u?.role === "commissionRm" ? "commission_rm" : "regional_rm",
          staffRegion: u?.region ?? null,
          leadId: t.leadId,
          leadName: lead?.brideName ?? t.leadName ?? null,
          leadDisplayId: lead?.displayId ?? null,
          leadRegion: lead?.region ?? null,
          leadStatus: lead?.status ?? null,
          confirmationStatus: "pending",
          muaName: mua?.name ?? null,
          pushStage: push?.stage ?? null,
          overdue: false,
          dueToday: false,
        };
      }),
    };
  },

  getMuaLedger: (opts: {
    muaId?: string | null;
    tier?: string | null;
    city?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }) => {
    if (opts.muaId) {
      const m = muas.find((x) => x.id === opts.muaId);
      const entries = comms
        .filter((c) => c.leadId && pushes.some((p) => p.muaId === opts.muaId && p.leadId === c.leadId))
        .slice(0, 15)
        .map((c) => ({
          id: c.id,
          createdAt: c.createdAt,
          entryType: c.entryType.replace(/([A-Z])/g, "_$1").toLowerCase(),
          description: c.description,
          actorName: c.actorName,
          leadDisplayId: leads.find((l) => l.id === c.leadId)?.displayId ?? null,
          brideName: leads.find((l) => l.id === c.leadId)?.brideName ?? null,
          budgetTier: leads.find((l) => l.id === c.leadId)?.budgetTier ?? null,
          region: leads.find((l) => l.id === c.leadId)?.region ?? null,
          pushStage: null,
          bookedPrice: null,
        }));
      return { entries, summary: [], strip: { totalPlanMuas: 0, activeThisMonth: 0, revenueThisMonth: 0, avgPushes: 0 } };
    }
    let summary = muas.map((m) => {
      const pushesThisMonth = pushes.filter((p) => p.muaId === m.id).length;
      return {
        id: m.id,
        displayId: m.displayId,
        name: m.name,
        city: m.city,
        planTier: m.planTier,
        planExpiry: m.planExpiry,
        pushesThisMonth,
        totalPushes: pushes.filter((p) => p.muaId === m.id).length,
        uniqueLeads: new Set(pushes.filter((p) => p.muaId === m.id).map((p) => p.leadId))
          .size,
        totalBookings: 0,
        totalRevenue: 0,
        revenueThisMonth: pushesThisMonth > 0 ? 45000 : 0,
        lastActivity: m.createdAt,
        monthlyPushTarget: m.planTier ? 20 : null,
        assuredBookings: null,
      };
    });
    if (opts.tier === "none") {
      summary = summary.filter((s) =>
        isMuaNotOnPlan({ planTier: s.planTier, planExpiry: s.planExpiry }),
      );
    } else if (opts.tier) {
      summary = summary.filter((s) => s.planTier === opts.tier);
    }
    if (opts.city) {
      const needle = opts.city.toLowerCase();
      summary = summary.filter((s) => s.city.toLowerCase().includes(needle));
    }
    const planMuas = summary.filter((s) => s.planTier);
    const active = summary.filter((s) => s.pushesThisMonth > 0);
    return {
      summary,
      strip: {
        totalPlanMuas: planMuas.length,
        activeThisMonth: active.length,
        revenueThisMonth: summary.reduce((a, s) => a + (s.revenueThisMonth ?? 0), 0),
        avgPushes:
          summary.length > 0
            ? Math.round(
                (summary.reduce((a, s) => a + s.pushesThisMonth, 0) / summary.length) * 10
              ) / 10
            : 0,
      },
      entries: [],
    };
  },

  getRevenueReport: (_opts: Record<string, string | null>) => ({
    rows: [] as Array<{
      id: string;
      bookingDate: string;
      bookedPrice: number;
      advancePaid: number | null;
      fullPaid: number | null;
      zohoInvoiceRef: string | null;
      outstanding: number;
      brideName: string;
      ceremonyType: string;
      eventDate: string;
      muaName: string;
      muaPlan: string | null;
      rmName: string | null;
      region: string;
      status: "Unpaid";
    }>,
    summary: {
      totalBooked: 0,
      totalAdvance: 0,
      totalFullPaid: 0,
      totalOutstanding: 0,
      countBookings: 0,
      countFullyPaid: 0,
      countPartial: 0,
      countUnpaid: 0,
    },
  }),
  getFeedbackOverview: (range: { dateFrom: string; dateTo: string }) => ({
    dateRange: range,
    queue: {
      toCall: 12,
      noContact: 4,
      followUpsDue: 3,
      feedbacksThisMonth: 28,
      referralsThisMonth: 9,
      muaProspectsThisMonth: 5,
      referralsConvertedThisMonth: 2,
      openFollowUps: 8,
      eligibleLeads: 45,
    },
    period: {
      feedbacks: 28,
      referrals: 9,
      muaProspects: 5,
      referralsConverted: 2,
      feedbackMuaBookings: 3,
    },
    outcomes: {
      connectedFeedbacks: 28,
      positive: 18,
      negative: 3,
      mixed: 7,
      notAnswered: 6,
      notInterested: 2,
      avgOlreadyRating: 4.2,
      avgMuaRating: 4.5,
      brideReferrals: 9,
      referralsConverted: 2,
      outsideMuas: 3,
      careTicketsRaised: 1,
      engageAgainYes: 20,
      engageAgainMaybe: 5,
      engageAgainNo: 3,
    },
    referrals: { pending: 4, pickedUp: 2, converted: 2, dismissed: 1 },
    queueToCall: [
      {
        leadId: "ld-2",
        displayId: "LD-00002",
        brideName: "Pending Bride",
        city: "Delhi",
        eventCity: "Delhi",
        feedbackStatus: null,
        lastFeedbackAt: null,
        attemptCount: 0,
        unreachableAttemptCount: 0,
      },
    ],
    queueNoContact: [],
    followUpsDue: [
      {
        taskId: "task-1",
        leadId: "ld-3",
        displayId: "LD-00003",
        brideName: "Callback Bride",
        staffName: "Neha Feedback",
        dueDate: new Date().toISOString().slice(0, 10),
        overdue: false,
        taskTitle: "Feedback call-back",
      },
    ],
    feedbackMuaBookings: [
      {
        feedbackId: "fb-book-1",
        leadId: "ld-1",
        displayId: "LD-00001",
        brideName: "Aisha Khan",
        muaId: "mua-1",
        muaName: "Demo MUA",
        muaDisplayId: "MUA-001",
        ceremonyType: "Wedding",
        eventDate: "2026-05-15",
        capturedAt: new Date().toISOString(),
        submittedByName: "Neha Feedback",
      },
    ],
    recentFeedbacks: [
      {
        id: "fb-1",
        leadId: "ld-1",
        displayId: "LD-00001",
        brideName: "Aisha Khan",
        connectionStatus: "connected",
        serviceSentiment: "positive",
        olreadyRating: 5,
        muaRating: 4,
        muaType: "olready",
        nonOlreadyMuaName: null,
        olreadyMuaName: "Demo MUA",
        noteSnippet: "Great service overall",
        engageAgain: "yes",
        submittedByName: "Neha Feedback",
        createdAt: new Date().toISOString(),
      },
    ],
    pendingReferrals: [
      {
        id: "ref-1",
        referralName: "Priya Referral",
        referralPhone: "9876500001",
        sourceLeadId: "ld-1",
        sourceLeadDisplayId: "LD-00001",
        sourceLeadName: "Aisha Khan",
        capturedByName: "Neha Feedback",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ],
    staff: [
      {
        staffId: "u-feedback-1",
        name: "Neha Feedback",
        feedbacksMtd: 14,
        referralsMtd: 5,
        notAnsweredMtd: 3,
        notInterestedMtd: 1,
        muaProspectsMtd: 2,
        openTasks: 6,
        followUpsDue: 2,
        overdueTasks: 1,
        callsMtd: 32,
        talkMinutesMtd: 145,
      },
      {
        staffId: "u-feedback-2",
        name: "Riya Feedback",
        feedbacksMtd: 14,
        referralsMtd: 4,
        notAnsweredMtd: 3,
        notInterestedMtd: 1,
        muaProspectsMtd: 3,
        openTasks: 5,
        followUpsDue: 1,
        overdueTasks: 2,
        callsMtd: 28,
        talkMinutesMtd: 120,
      },
    ],
  }),
  getUploaderOverview: (range: { dateFrom: string; dateTo: string }) => ({
    dateRange: range,
    tabs: {
      pending: 8,
      verified: 63,
      notAnswering: 3,
      notInterested: 11,
      deactivated: 5,
    },
    verifiedRouting: {
      rmQueue: 15,
      assigned: 42,
      commission: 4,
      portal: 6,
    },
    notInterestedBreakdown: {
      pendingReview: 2,
      confirmedNi: 6,
      rmError: 1,
      reopen: 2,
    },
    mtd: {
      added: 30,
      verified: 22,
      rejected: 4,
      notAnswering: 2,
      niClosed: 3,
      deactivated: 1,
    },
    pendingReferrals: 4,
    reverifyTasks: 2,
    pendingLeads: [
      {
        id: "ld-pending",
        displayId: "LD-00009",
        brideName: "Tanvi Shah",
        city: "Delhi",
        phone: "+91 98333 00003",
        source: "Referral",
        daysWaiting: 3,
        createdAt: new Date().toISOString(),
      },
    ],
    staff: [
      {
        staffId: "u-uploader-1",
        name: "Anita Uploader",
        addedMtd: 16,
        verifiedMtd: 12,
        rejectedMtd: 2,
        notAnsweringMtd: 1,
        niClosedMtd: 2,
        deactivatedMtd: 1,
        openTasks: 3,
        overdueTasks: 0,
        callsMtd: 45,
        talkMinutesMtd: 90,
      },
      {
        staffId: "u-uploader-2",
        name: "Kavita Uploader",
        addedMtd: 14,
        verifiedMtd: 10,
        rejectedMtd: 2,
        notAnsweringMtd: 1,
        niClosedMtd: 1,
        deactivatedMtd: 0,
        openTasks: 4,
        overdueTasks: 1,
        callsMtd: 38,
        talkMinutesMtd: 75,
      },
    ],
  }),
  getActivationOverview: (range: { dateFrom: string; dateTo: string }) => ({
    dateRange: range,
    summary: {
      pendingActivation: 7,
      sentBack: 2,
      activatedMtd: 5,
      revenueMtd: 125000,
      avgDaysPending: 6,
      pendingOver7Days: 3,
      pendingOver14Days: 1,
      overdueTasks: 2,
      atInvoiceStep: 2,
      atContractStep: 1,
    },
    pending: [
      {
        id: "pipe-1",
        muaName: "Glam Studio",
        muaCity: "Delhi",
        assignedSalesName: "Sales RM North",
        daysPending: 12,
        profileLinkVerified: true,
        invoiceGenerated: true,
        contractGenerated: false,
        hasContract: false,
      },
      {
        id: "pipe-2",
        muaName: "Bridal Bliss",
        muaCity: "Mumbai",
        assignedSalesName: "Sales RM West",
        daysPending: 4,
        profileLinkVerified: true,
        invoiceGenerated: false,
        contractGenerated: false,
        hasContract: false,
      },
    ],
    staff: [
      {
        staffId: "u-activation-1",
        name: "Pooja Activation",
        activatedMtd: 3,
        openTasks: 4,
        overdueTasks: 1,
        callsMtd: 22,
        talkMinutesMtd: 65,
      },
      {
        staffId: "u-activation-2",
        name: "Sonia Activation",
        activatedMtd: 2,
        openTasks: 3,
        overdueTasks: 1,
        callsMtd: 18,
        talkMinutesMtd: 50,
      },
    ],
  }),
};

const rmTargets: Record<
  string,
  {
    targetBookings: number;
    targetLeadsWorked: number;
    targetAvgMuasPerLead: number;
    targetCommission?: number | null;
    notes: string | null;
  }
> = {};

