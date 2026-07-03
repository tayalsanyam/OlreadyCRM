export type WhatsAppContext = {
  muaName?: string | null;
  brideName?: string | null;
  city?: string | null;
  scheduledTime?: string | null;
  ticketNumber?: string | null;
};

export function renderWhatsAppTemplate(body: string, ctx: WhatsAppContext): string {
  const muaName = ctx.muaName?.trim() || "there";
  const brideName = ctx.brideName?.trim() || "there";
  const city = ctx.city?.trim() || "your city";
  const scheduledTime = ctx.scheduledTime?.trim() || "[time/day]";
  const ticketNumber = ctx.ticketNumber?.trim() || "your ticket";

  const rendered = body
    .replaceAll("{muaName}", muaName)
    .replaceAll("{brideName}", brideName)
    .replaceAll("{city}", city)
    .replaceAll("{scheduledTime}", scheduledTime)
    .replaceAll("{ticketNumber}", ticketNumber)
    .replaceAll("[time/day]", scheduledTime)
    .replaceAll("[date/time]", scheduledTime)
    .replaceAll("[time]", scheduledTime)
    .replaceAll("[Name]", brideName);

  return sanitizeWhatsAppText(rendered);
}

/** Strip emoji / mojibake after greetings — wa.me often shows as ? on some devices. */
export function sanitizeWhatsAppText(text: string): string {
  return text
    .replace(/Hi ([^\n,]+) \uFFFD/g, "Hi $1,")
    .replace(/Hi ([^\n,]+) \?/g, "Hi $1,")
    .replace(/Hi ([^\n,]+) [\u{1F300}-\u{1FAFF}]/gu, "Hi $1,")
    .replace(/ 😊/g, ",")
    .replace(/Hi ([^\n,]+),,/g, "Hi $1,");
}

export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}

export function buildWaMeUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function resolveMuaPhone(
  whatsapp: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  return whatsapp?.trim() || phone?.trim() || null;
}
