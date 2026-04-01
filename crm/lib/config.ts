import { isSupabaseConfigured } from "./supabase";
import * as dbConfig from "./db/config";
import * as sheetConfig from "./db/config-sheets";

const useSupabase = () => isSupabaseConfigured();
export async function getBDMs(): Promise<string[]> {
  return useSupabase() ? dbConfig.getBDMs() : sheetConfig.getBDMs();
}

export async function getBDMTargets(): Promise<Record<string, number>> {
  return useSupabase() ? dbConfig.getBDMTargets() : sheetConfig.getBDMTargets();
}

export async function saveBDMTargets(targets: Record<string, number>): Promise<void> {
  return useSupabase() ? dbConfig.saveBDMTargets(targets) : sheetConfig.saveBDMTargets(targets);
}

export async function getPlans(): Promise<{ name: string; price: number }[]> {
  return useSupabase() ? dbConfig.getPlans() : sheetConfig.getPlans();
}

export async function saveBDMs(bdms: string[]): Promise<void> {
  return useSupabase() ? dbConfig.saveBDMs(bdms) : sheetConfig.saveBDMs(bdms);
}

export async function renameBDM(oldName: string, newName: string): Promise<void> {
  return useSupabase() ? dbConfig.renameBDM(oldName, newName) : sheetConfig.renameBDM(oldName, newName);
}

export async function savePlans(plans: { name: string; price: number; active?: boolean }[]): Promise<void> {
  return useSupabase() ? dbConfig.savePlans(plans) : sheetConfig.savePlans(plans);
}

export async function getOpsCoordinators(): Promise<string[]> {
  return useSupabase() ? dbConfig.getOpsCoordinators() : [];
}

export async function saveOpsCoordinators(names: string[]): Promise<void> {
  return useSupabase() ? dbConfig.saveOpsCoordinators(names) : undefined;
}
