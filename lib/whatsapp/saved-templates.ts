import type { WhatsAppTemplatePool } from "./templates";
import type { WhatsAppConfig } from "./config";

export type SavedWhatsAppTemplate = {
  id: string;
  label: string;
  pool: WhatsAppTemplatePool;
  body: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
};

export const CUSTOM_TEMPLATE_ID = "__custom__";

export function listSavedTemplates(config?: WhatsAppConfig | null): SavedWhatsAppTemplate[] {
  return config?.savedTemplates ?? [];
}

export function appendSavedTemplate(
  config: WhatsAppConfig,
  entry: SavedWhatsAppTemplate,
): WhatsAppConfig {
  const existing = listSavedTemplates(config);
  return {
    ...config,
    savedTemplates: [...existing, entry],
  };
}

export function updateSavedTemplate(
  config: WhatsAppConfig,
  id: string,
  patch: Partial<Pick<SavedWhatsAppTemplate, "label" | "body" | "pool">> & {
    updatedBy?: string;
    updatedByName?: string;
  },
): WhatsAppConfig | null {
  const existing = listSavedTemplates(config);
  const idx = existing.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const next = [...existing];
  next[idx] = {
    ...next[idx]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return { ...config, savedTemplates: next };
}

export function removeSavedTemplate(
  config: WhatsAppConfig,
  id: string,
): WhatsAppConfig {
  return {
    ...config,
    savedTemplates: listSavedTemplates(config).filter((t) => t.id !== id),
  };
}

export function newSavedTemplateId(): string {
  return `saved-${crypto.randomUUID()}`;
}
