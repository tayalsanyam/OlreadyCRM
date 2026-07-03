export const CORRESPONDENCE_KINDS = ["care_reply", "party_reply", "internal_note"] as const;
export type CorrespondenceKind = (typeof CORRESPONDENCE_KINDS)[number];

export const CORRESPONDENCE_CHANNELS = [
  "email",
  "whatsapp",
  "phone",
  "in_person",
  "other",
] as const;
export type CorrespondenceChannel = (typeof CORRESPONDENCE_CHANNELS)[number];

export function isCorrespondenceKind(value: string): value is CorrespondenceKind {
  return (CORRESPONDENCE_KINDS as readonly string[]).includes(value);
}

export function isCorrespondenceChannel(value: string): value is CorrespondenceChannel {
  return (CORRESPONDENCE_CHANNELS as readonly string[]).includes(value);
}

export const CORRESPONDENCE_KIND_LABEL: Record<CorrespondenceKind, string> = {
  care_reply: "Our response",
  party_reply: "Their response",
  internal_note: "Internal note",
};

export const CORRESPONDENCE_CHANNEL_LABEL: Record<CorrespondenceChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  phone: "Phone",
  in_person: "In person",
  other: "Other",
};
