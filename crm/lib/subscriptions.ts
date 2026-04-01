import { isSupabaseConfigured } from "./supabase";
import * as db from "./db/subscriptions";

const useSupabase = () => isSupabaseConfigured();

export type { Subscription } from "./db/subscriptions";
export { addMonths, addDays } from "./db/subscriptions";

export async function getSubscriptionById(subId: string) {
  return useSupabase() ? db.getSubscriptionById(subId) : null;
}

export async function getSubscriptionsByLeadId(leadId: string) {
  return useSupabase() ? db.getSubscriptionsByLeadId(leadId) : [];
}

export async function getSubscriptionsByLeadIds(leadIds: string[]) {
  return useSupabase() ? db.getSubscriptionsByLeadIds(leadIds) : [];
}

export async function createSubscription(sub: Parameters<typeof db.createSubscription>[0]) {
  return useSupabase() ? db.createSubscription(sub) : null;
}

export async function updateSubscription(id: string, updates: Parameters<typeof db.updateSubscription>[1]) {
  return useSupabase() ? db.updateSubscription(id, updates) : null;
}
