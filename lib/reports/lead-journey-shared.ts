import { INTAKE_MIN_PROFILES } from "@/lib/lead-intake-config";
import { daysBetween, median, percentile90 } from "@/lib/report-utils";

export type RawLeadJourneyRow = {
  id: string;
  displayId: string;
  brideName: string;
  region: string | null;
  budgetTier: string;
  status: string;
  eventDate: string;
  source: string | null;
  urgencyBand: string;
  rmName: string | null;
  leadPhase: string | null;
  portalOnly: boolean;
  lastContactAt: string | null;
  tCreated: string | null;
  tVerified: string | null;
  tAssigned: string | null;
  tFirstPush: string | null;
  tOfferSent: string | null;
  tNegotiating: string | null;
  tBooked: string | null;
  tShifted: string | null;
  tConfirmed: string | null;
  confirmationStatus: string | null;
  intakeProfilesCount: number;
  totalMuasOffered: number;
  totalPushes: number;
  bookingsCount: number;
};

export type EnrichedLeadJourneyRow = RawLeadJourneyRow & {
  intakeGateComplete: boolean;
  daysToVerify: number | null;
  daysToAssign: number | null;
  daysToConfirm: number | null;
  daysToFirstPush: number | null;
  daysToOfferSent: number | null;
  daysToNegotiating: number | null;
  daysToBooking: number | null;
  daysOfferToBooking: number | null;
  daysToShift: number | null;
  totalDaysOpen: number | null;
  currentFunnelStage: LeadJourneyFunnelStageKey | null;
};

export const LEAD_JOURNEY_FUNNEL_STAGES = [
  { key: "created", label: "Created" },
  { key: "verified", label: "Verified" },
  { key: "assigned", label: "Assigned" },
  { key: "confirmed", label: "Bride confirmed" },
  { key: "intakeReady", label: `Has ${INTAKE_MIN_PROFILES} profiles` },
  { key: "firstPush", label: "First push" },
  { key: "offerSent", label: "Offer sent" },
  { key: "booked", label: "Booked" },
] as const;

export type LeadJourneyFunnelStageKey = (typeof LEAD_JOURNEY_FUNNEL_STAGES)[number]["key"];

export const LEAD_JOURNEY_INTERVALS = [
  { from: "created", to: "verified", label: "Created→Verified", daysKey: "daysToVerify" },
  { from: "verified", to: "assigned", label: "Verified→Assigned", daysKey: "daysToAssign" },
  { from: "assigned", to: "confirmed", label: "Assigned→Confirmed", daysKey: "daysToConfirm" },
  { from: "assigned", to: "firstPush", label: "Assigned→First push", daysKey: "daysToFirstPush" },
  { from: "firstPush", to: "offerSent", label: "First push→Offer", daysKey: "daysToOfferSent" },
  { from: "offerSent", to: "booked", label: "Offer→Booked", daysKey: "daysOfferToBooking" },
  { from: "assigned", to: "booked", label: "Assigned→Booking", daysKey: "daysToBooking" },
] as const satisfies ReadonlyArray<{
  from: LeadJourneyFunnelStageKey;
  to: LeadJourneyFunnelStageKey;
  label: string;
  daysKey: keyof EnrichedLeadJourneyRow;
}>;

export function parseLeadJourneyFunnelStage(raw: string | null): LeadJourneyFunnelStageKey | null {
  if (!raw) return null;
  return LEAD_JOURNEY_FUNNEL_STAGES.some((s) => s.key === raw)
    ? (raw as LeadJourneyFunnelStageKey)
    : null;
}

function isLeadTerminalForFunnel(lead: Pick<EnrichedLeadJourneyRow, "leadPhase" | "status">): boolean {
  return (
    lead.leadPhase === "closed" ||
    lead.leadPhase === "expired" ||
    lead.status === "archived"
  );
}

function hasIntakeProfiles(lead: Pick<EnrichedLeadJourneyRow, "intakeProfilesCount">): boolean {
  return (lead.intakeProfilesCount ?? 0) >= INTAKE_MIN_PROFILES;
}

function isBrideConfirmed(lead: Pick<EnrichedLeadJourneyRow, "tConfirmed" | "confirmationStatus">): boolean {
  return !!lead.tConfirmed || lead.confirmationStatus === "confirmed";
}

export function leadJourneyFunnelStageDisplay(
  lead: Pick<EnrichedLeadJourneyRow, "leadPhase" | "status" | "currentFunnelStage">
): string {
  if (lead.leadPhase === "closed") return "Closed";
  if (lead.leadPhase === "expired") return "Expired";
  if (lead.status === "archived") return "Archived";
  return lead.currentFunnelStage ? funnelStageLabel(lead.currentFunnelStage) : "—";
}

function stageTimestamp(
  lead: EnrichedLeadJourneyRow,
  key: LeadJourneyFunnelStageKey
): string | null {
  switch (key) {
    case "created":
      return lead.tCreated;
    case "verified":
      return lead.tVerified;
    case "assigned":
      return lead.tAssigned;
    case "confirmed":
      return lead.tConfirmed ?? (lead.confirmationStatus === "confirmed" ? lead.tAssigned : null);
    case "intakeReady":
      if (!hasIntakeProfiles(lead) && !lead.tFirstPush) return null;
      return lead.tFirstPush ?? lead.tConfirmed ?? lead.tAssigned;
    case "firstPush":
      return lead.tFirstPush;
    case "offerSent":
      return lead.tOfferSent;
    case "booked":
      return lead.tBooked;
    default:
      return null;
  }
}

export function leadReachedFunnelStage(
  lead: EnrichedLeadJourneyRow,
  stage: LeadJourneyFunnelStageKey
): boolean {
  return stageTimestamp(lead, stage) != null;
}

/** Lead is currently waiting at this funnel stage (reached it but not the next). */
export function leadAtFunnelStage(
  lead: EnrichedLeadJourneyRow,
  stage: LeadJourneyFunnelStageKey
): boolean {
  if (isLeadTerminalForFunnel(lead)) return false;
  switch (stage) {
    case "created":
      return !!lead.tCreated && !lead.tVerified;
    case "verified":
      return !!lead.tVerified && !lead.tAssigned;
    case "assigned":
      return (
        !!lead.tAssigned &&
        lead.confirmationStatus !== "confirmed" &&
        !lead.tConfirmed
      );
    case "confirmed":
      return isBrideConfirmed(lead) && !hasIntakeProfiles(lead) && !lead.tFirstPush;
    case "intakeReady":
      return hasIntakeProfiles(lead) && !lead.tFirstPush;
    case "firstPush":
      return !!lead.tFirstPush && !lead.tOfferSent;
    case "offerSent":
      return !!lead.tOfferSent && !lead.tBooked;
    case "booked":
      return false;
    default:
      return false;
  }
}

export function getLeadCurrentFunnelStage(
  lead: EnrichedLeadJourneyRow
): LeadJourneyFunnelStageKey | null {
  if (isLeadTerminalForFunnel(lead)) return null;
  for (let i = LEAD_JOURNEY_FUNNEL_STAGES.length - 1; i >= 0; i -= 1) {
    const stage = LEAD_JOURNEY_FUNNEL_STAGES[i]!;
    if (leadAtFunnelStage(lead, stage.key)) return stage.key;
  }
  if (lead.tBooked) return "booked";
  return null;
}

export function funnelStageLabel(key: LeadJourneyFunnelStageKey): string {
  return LEAD_JOURNEY_FUNNEL_STAGES.find((s) => s.key === key)?.label ?? key;
}

export function filterLeadsByFunnelStage(
  leads: EnrichedLeadJourneyRow[],
  stage: LeadJourneyFunnelStageKey | null
): EnrichedLeadJourneyRow[] {
  if (!stage) return leads;
  return leads.filter((lead) => leadAtFunnelStage(lead, stage));
}

export function enrichLeadJourneyRow(row: RawLeadJourneyRow): EnrichedLeadJourneyRow {
  const end = row.tBooked ?? row.tShifted ?? new Date().toISOString();
  const enriched = {
    ...row,
    intakeGateComplete:
      (row.intakeProfilesCount ?? 0) >= INTAKE_MIN_PROFILES || !!row.tFirstPush,
    daysToVerify: daysBetween(row.tVerified, row.tCreated),
    daysToAssign: daysBetween(row.tAssigned, row.tVerified),
    daysToConfirm: daysBetween(row.tConfirmed, row.tAssigned),
    daysToFirstPush: daysBetween(row.tFirstPush, row.tAssigned),
    daysToOfferSent: daysBetween(row.tOfferSent, row.tFirstPush),
    daysToNegotiating: daysBetween(row.tNegotiating, row.tOfferSent),
    daysToBooking: daysBetween(row.tBooked, row.tAssigned),
    daysOfferToBooking: daysBetween(row.tBooked, row.tOfferSent),
    daysToShift: daysBetween(row.tShifted, row.tAssigned),
    totalDaysOpen: daysBetween(end, row.tCreated),
  };
  return {
    ...enriched,
    currentFunnelStage: getLeadCurrentFunnelStage({
      ...enriched,
      currentFunnelStage: null,
    }),
  };
}

export function buildLeadJourneySummary(leads: EnrichedLeadJourneyRow[]) {
  const stageDefs = LEAD_JOURNEY_FUNNEL_STAGES.map((s) => ({
    ...s,
    ts: (l: EnrichedLeadJourneyRow) => stageTimestamp(l, s.key),
  }));

  const funnel = stageDefs.map((s, i) => {
    const reached = leads.filter((l) => s.ts(l)).length;
    let avgDays: number | null = null;
    if (i > 0) {
      const prev = stageDefs[i - 1]!;
      const interval = LEAD_JOURNEY_INTERVALS.find(
        (iv) => iv.from === prev.key && iv.to === s.key
      );
      if (interval) {
        const vals = leads
          .map((l) => l[interval.daysKey] as number | null)
          .filter((v): v is number => v !== null);
        avgDays =
          vals.length > 0
            ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
            : null;
      }
    }
    return { stage: s.label, stageKey: s.key, reached, avgDaysFromPrev: avgDays };
  });

  const stats = LEAD_JOURNEY_INTERVALS.map((iv) => {
    const vals = leads
      .map((l) => l[iv.daysKey] as number | null)
      .filter((v): v is number => v !== null);
    return {
      label: iv.label,
      median: median(vals),
      p90: percentile90(vals),
      avg:
        vals.length > 0
          ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
          : null,
    };
  });

  const bottleneck = stats
    .filter((s) => s.avg !== null)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0];

  return { funnel, stats, bottleneck };
}

export function buildLeadJourneyAtStageCounts(leads: EnrichedLeadJourneyRow[]) {
  return LEAD_JOURNEY_FUNNEL_STAGES.map(({ key, label }) => ({
    key,
    label,
    count: leads.filter((lead) => leadAtFunnelStage(lead, key)).length,
  }));
}
