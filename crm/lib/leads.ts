import { isSupabaseConfigured } from "./supabase";
import * as dbLeads from "./db/leads";
import * as sheetLeads from "./db/leads-sheets";
import type { Lead } from "./types";

const useSupabase = () => isSupabaseConfigured();

export const getSellingPrice = dbLeads.getSellingPrice;
export const getBalance = dbLeads.getBalance;
export type { LeadFilters } from "./db/leads";

export async function getLeads(filters?: dbLeads.LeadFilters): Promise<Lead[]> {
  return useSupabase() ? dbLeads.getLeads(filters) : sheetLeads.getLeads(filters);
}

export async function getLeadById(id: string): Promise<Lead | null> {
  return useSupabase() ? dbLeads.getLeadById(id) : sheetLeads.getLeadById(id);
}

export async function findDuplicatePhone(phone: string, excludeId?: string): Promise<Lead | null> {
  return useSupabase() ? dbLeads.findDuplicatePhone(phone, excludeId) : sheetLeads.findDuplicatePhone(phone, excludeId);
}

export async function createLead(lead: Omit<Lead, "id" | "created_at" | "last_modified">): Promise<Lead> {
  return useSupabase() ? dbLeads.createLead(lead) : sheetLeads.createLead(lead);
}

export async function updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
  return useSupabase() ? dbLeads.updateLead(leadId, updates) : sheetLeads.updateLead(leadId, updates);
}

export async function recordPayment(leadId: string, amount: number, mode: string): Promise<Lead | null> {
  return useSupabase() ? dbLeads.recordPayment(leadId, amount, mode) : sheetLeads.recordPayment(leadId, amount, mode);
}

export async function deleteLeadsBySource(source: string): Promise<number> {
  return useSupabase() ? dbLeads.deleteLeadsBySource(source) : 0;
}

export async function bulkUpdateLeads(
  ids: string[],
  updates: { active?: boolean; bdm?: string }
): Promise<number> {
  return useSupabase() ? dbLeads.bulkUpdateLeads(ids, updates) : 0;
}
