import { sql } from "@/db/index";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  resolveWhatsAppConfig,
  type ResolvedWhatsAppConfig,
  type WhatsAppConfig,
} from "./config";

export async function loadWhatsAppConfigFromDb(): Promise<WhatsAppConfig> {
  if (USE_MOCK) {
    return mockStore.getWhatsAppConfig();
  }
  const [row] = await sql<{ whatsappConfig?: WhatsAppConfig }[]>`
    SELECT whatsapp_config AS "whatsappConfig" FROM sla_config WHERE id = 1
  `;
  return (row?.whatsappConfig as WhatsAppConfig) ?? {};
}

export async function loadResolvedWhatsAppConfig(): Promise<ResolvedWhatsAppConfig> {
  const stored = await loadWhatsAppConfigFromDb();
  return resolveWhatsAppConfig(stored);
}
