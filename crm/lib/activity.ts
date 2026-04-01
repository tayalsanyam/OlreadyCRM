import { isSupabaseConfigured } from "./supabase";
import * as dbActivity from "./db/activity";
import * as sheetActivity from "./db/activity-sheets";

const useSupabase = () => isSupabaseConfigured();

export type { ActivityEntry } from "./db/activity";

export async function addActivity(
  leadId: string,
  action: string,
  user: string,
  notes?: string,
  opts?: { status?: string; remarks?: string; next_connect?: string }
): Promise<void> {
  return useSupabase() ? dbActivity.addActivity(leadId, action, user, notes, opts) : sheetActivity.addActivity(leadId, action, user, notes, opts);
}

export async function getActivityLog(filters?: { lead_id?: string; dateFrom?: string; dateTo?: string }): Promise<dbActivity.ActivityEntry[]> {
  return useSupabase() ? dbActivity.getActivityLog(filters) : sheetActivity.getActivityLog(filters);
}
