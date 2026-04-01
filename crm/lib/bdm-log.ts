import { isSupabaseConfigured } from "./supabase";
import * as dbBdmLog from "./db/bdm-log";
import * as sheetBdmLog from "./db/bdm-log-sheets";
import type { BDMLogEntry } from "./types";

const useSupabase = () => isSupabaseConfigured();

export async function getBDMLogs(filters?: { bdm?: string; dateFrom?: string; dateTo?: string }): Promise<BDMLogEntry[]> {
  return useSupabase() ? dbBdmLog.getBDMLogs(filters) : sheetBdmLog.getBDMLogs(filters);
}

export async function addBDMLog(entry: Omit<BDMLogEntry, "id">): Promise<BDMLogEntry> {
  return useSupabase() ? dbBdmLog.addBDMLog(entry) : sheetBdmLog.addBDMLog(entry);
}
