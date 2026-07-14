import { getTemplateById } from "./templates";

const PREVIEW_MAX = 220;

export function whatsAppTemplateLabel(metadata?: Record<string, unknown>): string | null {
  if (typeof metadata?.templateLabel === "string" && metadata.templateLabel.trim()) {
    return metadata.templateLabel.trim();
  }
  if (typeof metadata?.templateId === "string") {
    return getTemplateById(metadata.templateId)?.label ?? metadata.templateId;
  }
  return null;
}

export function whatsAppMessagePreview(metadata?: Record<string, unknown>): string | null {
  if (typeof metadata?.messagePreview === "string" && metadata.messagePreview.trim()) {
    return metadata.messagePreview.trim();
  }
  return null;
}

export function truncateWhatsAppPreview(text: string, max = PREVIEW_MAX): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}
