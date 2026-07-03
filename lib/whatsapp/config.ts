import type { MuaPushStage, PipelineStage } from "@/lib/types";
import {
  RM_PUSH_BRIDE_DEFAULT_TEMPLATE,
  RM_PUSH_STAGE_DEFAULT_TEMPLATE,
  SALES_STAGE_DEFAULT_TEMPLATE,
  WHATSAPP_TEMPLATES,
  defaultCareTemplateId,
  defaultFeedbackTemplateId,
  type WhatsAppTemplate,
  type WhatsAppTemplatePool,
} from "./templates";
import { listSavedTemplates, type SavedWhatsAppTemplate } from "./saved-templates";

export type { SavedWhatsAppTemplate } from "./saved-templates";

export type WhatsAppConfig = {
  templateBodies?: Record<string, string>;
  templateImageUrls?: Record<string, string>;
  salesStageDefaults?: Partial<Record<PipelineStage, string>>;
  rmPushStageDefaults?: Partial<Record<MuaPushStage, string>>;
  rmPushBrideDefaults?: Partial<Record<MuaPushStage, string>>;
  savedTemplates?: SavedWhatsAppTemplate[];
};

export type ResolvedWhatsAppConfig = {
  templates: WhatsAppTemplate[];
  savedTemplates: SavedWhatsAppTemplate[];
  salesStageDefaults: Partial<Record<PipelineStage, string>>;
  rmPushStageDefaults: Partial<Record<MuaPushStage, string>>;
  rmPushBrideDefaults: Partial<Record<MuaPushStage, string>>;
};

export function resolveWhatsAppConfig(stored?: WhatsAppConfig | null): ResolvedWhatsAppConfig {
  const overrides = stored?.templateBodies ?? {};
  const imageUrls = stored?.templateImageUrls ?? {};
  const saved = listSavedTemplates(stored);
  const builtIn = WHATSAPP_TEMPLATES.map((t) => {
    const body = overrides[t.id]?.trim();
    const imageUrl = imageUrls[t.id]?.trim() || null;
    return {
      ...t,
      ...(body ? { body } : {}),
      imageUrl,
    };
  });
  const savedAsTemplates: WhatsAppTemplate[] = saved.map((t) => ({
    id: t.id,
    label: t.label,
    pool: t.pool,
    body: t.body,
    saved: true,
    createdBy: t.createdBy,
    createdByName: t.createdByName,
    createdAt: t.createdAt,
  }));

  return {
    templates: [...builtIn, ...savedAsTemplates],
    savedTemplates: saved,
    salesStageDefaults: { ...SALES_STAGE_DEFAULT_TEMPLATE, ...stored?.salesStageDefaults },
    rmPushStageDefaults: { ...RM_PUSH_STAGE_DEFAULT_TEMPLATE, ...stored?.rmPushStageDefaults },
    rmPushBrideDefaults: { ...RM_PUSH_BRIDE_DEFAULT_TEMPLATE, ...stored?.rmPushBrideDefaults },
  };
}

export function templatesForPoolResolved(
  pool: WhatsAppTemplatePool,
  templates: WhatsAppTemplate[],
): WhatsAppTemplate[] {
  return templates.filter((t) => t.pool === pool);
}

export function getTemplateByIdResolved(
  id: string,
  templates: WhatsAppTemplate[],
): WhatsAppTemplate | undefined {
  return templates.find((t) => t.id === id);
}

export function defaultTemplateIdForSalesStageResolved(
  stage: PipelineStage | null | undefined,
  defaults: Partial<Record<PipelineStage, string>>,
): string {
  if (!stage) return "sales-first-outreach";
  return defaults[stage] ?? "sales-follow-up";
}

export function defaultTemplateIdForPushStageResolved(
  stage: MuaPushStage | null | undefined,
  defaults: Partial<Record<MuaPushStage, string>>,
): string {
  if (!stage) return "rm-mua-initial";
  return defaults[stage] ?? "rm-mua-followup";
}

export function defaultBrideTemplateIdResolved(
  pushStage: MuaPushStage | null | undefined,
  defaults: Partial<Record<MuaPushStage, string>>,
): string {
  if (pushStage) return defaults[pushStage] ?? "rm-bride-profiles";
  return "rm-bride-profiles";
}

export function defaultCareTemplateIdResolved(): string {
  return defaultCareTemplateId();
}

export function defaultFeedbackTemplateIdResolved(): string {
  return defaultFeedbackTemplateId();
}
