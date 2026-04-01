import { isSupabaseConfigured } from "./supabase";
import * as db from "./db/customers";

const useSupabase = () => isSupabaseConfigured();

export type { Customer } from "./db/customers";

export async function getCustomerByLeadId(leadId: string) {
  return useSupabase() ? db.getCustomerByLeadId(leadId) : null;
}

export async function createCustomer(customer: Parameters<typeof db.createCustomer>[0]) {
  return useSupabase() ? db.createCustomer(customer) : null;
}

export async function getCustomers(filters?: Parameters<typeof db.getCustomers>[0]) {
  return useSupabase() ? db.getCustomers(filters) : [];
}

export async function getCustomersByLeadIds(leadIds: string[]) {
  return useSupabase() ? db.getCustomersByLeadIds(leadIds) : [];
}
