import { isSupabaseConfigured } from "./supabase";
import * as db from "./db/renewal-deals";

const useSupabase = () => isSupabaseConfigured();

export type { RenewalDeal } from "./db/renewal-deals";
export { getRenewalDealSellingPrice, getRenewalDealBalance } from "./db/renewal-deals";

export async function getPendingRenewalDeals() {
  return useSupabase() ? db.getPendingRenewalDeals() : [];
}

export async function getRenewalDealsByLeadId(leadId: string) {
  return useSupabase() ? db.getRenewalDealsByLeadId(leadId) : [];
}

export async function getRenewalDealsByLeadIds(leadIds: string[]) {
  return useSupabase() ? db.getRenewalDealsByLeadIds(leadIds) : [];
}

export async function getRenewalDealById(dealId: string) {
  return useSupabase() ? db.getRenewalDealById(dealId) : null;
}

export async function createRenewalDeal(deal: Parameters<typeof db.createRenewalDeal>[0]) {
  return useSupabase() ? db.createRenewalDeal(deal) : null;
}

export async function updateRenewalDeal(id: string, updates: Parameters<typeof db.updateRenewalDeal>[1]) {
  return useSupabase() ? db.updateRenewalDeal(id, updates) : null;
}

export async function recordRenewalPayment(dealId: string, amount: number) {
  return useSupabase() ? db.recordRenewalPayment(dealId, amount) : null;
}
