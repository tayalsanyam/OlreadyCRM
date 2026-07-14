import { fromDbCommEntryType } from "@/lib/db-mappers";
import { rowsToCsv } from "@/lib/csv";
import { csvDateCell, csvDateTimeCell } from "@/lib/utils";
import type { CommEntry, CommEntryType } from "@/lib/types";

export const COMM_ENTRY_LABELS: Partial<Record<CommEntryType, string>> = {
  leadCreated: "Created",
  leadVerified: "Verified",
  assigned: "Assigned",
  muaPushed: "MUA pushed",
  stageUpdated: "Stage",
  callLogged: "Call",
  whatsappLogged: "WhatsApp",
  shiftedCommission: "Commission handoff",
  hostileFlagged: "Not answering",
  bookingConfirmed: "Booked",
  note: "Note",
  softCheckin: "Soft check-in",
  closeConfirmation: "Close confirmation",
  conversationClosed: "Conversation closed",
};

export function commEntryLabel(type: CommEntryType | string): string {
  const mapped =
    typeof type === "string" && !type.includes("_")
      ? (type as CommEntryType)
      : fromDbCommEntryType(type);
  return COMM_ENTRY_LABELS[mapped] ?? mapped;
}

export type LeadLogMeta = {
  displayId: string;
  brideName: string;
  region?: string;
  eventDate?: string;
};

export function leadCommsToCsv(comms: CommEntry[], meta: LeadLogMeta): string {
  const headers = [
    "Lead ID",
    "Bride",
    "Region",
    "Event date",
    "When",
    "Type",
    "Actor",
    "Description",
  ];
  const region = meta.region ?? "";
  const eventDate = csvDateCell(meta.eventDate);
  const data = comms.map((c) => [
    meta.displayId,
    meta.brideName,
    region,
    eventDate,
    csvDateTimeCell(c.createdAt),
    commEntryLabel(c.entryType),
    c.actorName ?? "",
    c.description,
  ]);
  return rowsToCsv(headers, data);
}
