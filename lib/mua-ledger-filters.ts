import type { MuaLedgerEntry } from "@/lib/mua-ledger-query";

export type MuaLedgerDetailTab = "full" | "external";

/** RM comms & plan/audit events shareable in the MUA activity view. */
const RM_MUA_ACTIVITY_TYPES = new Set([
  "mua_created",
  "mua_activated",
  "plan_assigned",
  "rm_assigned",
  "mua_pushed",
  "booking_confirmed",
  "booking_cancelled",
  "call_logged",
  "callyzer_synced",
  "whatsapp_logged",
  "care_email_sent",
  "care_escalation",
]);

/** Sales pipeline comms that document onboarding, training, activation & outreach. */
const SALES_MUA_ACTIVITY_TYPES = new Set([
  "mua_activated",
  "callLogged",
  "whatsappLogged",
  "emailLogged",
  "onboardingUpdated",
  "trainingUpdated",
  "activationUpdated",
]);

/** Care ticket events included in MUA activity (not internal comments). */
const CARE_MUA_ACTIVITY_TYPES = new Set(["care_email", "ticket_escalation"]);

export function isExternalMuaLedgerEntry(entry: MuaLedgerEntry): boolean {
  if (entry.source === "care") {
    return CARE_MUA_ACTIVITY_TYPES.has(entry.entryType);
  }

  if (entry.source === "sales") {
    return SALES_MUA_ACTIVITY_TYPES.has(entry.entryType);
  }

  if (entry.source === "call") {
    return entry.entryType === "call_logged";
  }

  if (entry.source === "plan") {
    return RM_MUA_ACTIVITY_TYPES.has(entry.entryType);
  }

  return RM_MUA_ACTIVITY_TYPES.has(entry.entryType);
}

export function filterMuaLedgerEntries(
  entries: MuaLedgerEntry[],
  tab: MuaLedgerDetailTab
): MuaLedgerEntry[] {
  if (tab === "full") return entries;
  return entries.filter(isExternalMuaLedgerEntry);
}
