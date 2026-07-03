import type { StaffActivityEntryGroupKey } from "@/lib/admin-reports-hub-activity-types";
import type { BackendStaffRole } from "@/lib/targets";

export type StaffActivityRoleFilter = BackendStaffRole | "lead_uploader" | "all";

export type StaffActivityRow = {
  id: string;
  createdAt: string;
  entryType: string;
  description: string;
  actorName: string | null;
  actorRole: string;
  leadId: string | null;
  leadDisplayId: string | null;
  brideName: string | null;
  leadRegion: string | null;
};

export type StaffActivityEntryGroupSummary = {
  key: StaffActivityEntryGroupKey;
  label: string;
  count: number;
};

export type StaffActivitySummary = {
  total: number;
  regionalRm: number;
  commissionRm: number;
  leadUploader: number;
  entryGroups: StaffActivityEntryGroupSummary[];
};

export type StaffActivityPayload = {
  dateFrom: string;
  dateTo: string;
  role: StaffActivityRoleFilter;
  staffId: string | null;
  search: string | null;
  entryGroups: StaffActivityEntryGroupKey[];
  summary: StaffActivitySummary;
  rows: StaffActivityRow[];
};

export type PerformanceTargetSlice = {
  targetBookings: number | null;
  targetLeadsWorked: number | null;
  targetAvgMuasPerLead: number | null;
  targetCommission: number | null;
  actualBookings: number;
  actualLeadsWorked: number;
  actualAvgMuasPerLead: number;
  actualCommissionCollected: number;
  monthConversionPct: number;
};

export type PerformanceRow = {
  staffId: string;
  staffName: string;
  role: string;
  region: string;
  totalActive: number;
  totalBooked: number;
  totalShifted: number;
  conversionPct: number | null;
  avgPushesPerLead: number | null;
  staleLeads: number;
  pendingConfirmation: number;
  awaitingProfiles: number;
  overdueIntakeTasks: number;
  targets: PerformanceTargetSlice | null;
};

export type InactiveLeadAlert = {
  id: string;
  brideName: string;
  urgencyBand: string;
  hoursSince: number;
};

export type PerformancePayload = {
  month: string;
  staleThresholdHours: number;
  summary: {
    staffCount: number;
    totalStale: number;
    totalOverdueIntake: number;
    targetsSet: number;
    bookingsOnTrack: number;
    bookingsBehind: number;
    bestConversion: { name: string; pct: number } | null;
  };
  inactiveCriticalHot: InactiveLeadAlert[];
  rows: PerformanceRow[];
};
