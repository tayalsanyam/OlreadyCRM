import { COMM } from "@/lib/comm-types";

export const STAFF_ACTIVITY_ENTRY_GROUPS = [
  {
    key: "mua_push",
    label: "MUA push",
    entryTypes: [COMM.muaPushed],
  },
  {
    key: "callyzer",
    label: "Callyzer",
    entryTypes: [COMM.callyzerSynced, COMM.callLogged],
  },
  {
    key: "stage_updates",
    label: "Stage updates",
    entryTypes: [COMM.stageUpdated],
  },
  {
    key: "bookings_confirmed",
    label: "Bookings confirmed",
    entryTypes: [COMM.bookingConfirmed],
  },
  {
    key: "whatsapp_logged",
    label: "WhatsApp logged",
    entryTypes: [COMM.whatsappLogged],
  },
] as const;

export type StaffActivityEntryGroupKey = (typeof STAFF_ACTIVITY_ENTRY_GROUPS)[number]["key"];

const GROUP_BY_ENTRY_TYPE = new Map<string, StaffActivityEntryGroupKey>();
for (const group of STAFF_ACTIVITY_ENTRY_GROUPS) {
  for (const entryType of group.entryTypes) {
    GROUP_BY_ENTRY_TYPE.set(entryType, group.key);
  }
}

export function parseStaffActivityEntryGroups(raw: string | null): StaffActivityEntryGroupKey[] {
  if (!raw?.trim()) return [];
  const valid = new Set(STAFF_ACTIVITY_ENTRY_GROUPS.map((g) => g.key));
  const seen = new Set<StaffActivityEntryGroupKey>();
  for (const part of raw.split(",")) {
    const key = part.trim() as StaffActivityEntryGroupKey;
    if (valid.has(key)) seen.add(key);
  }
  return [...seen];
}

export function staffActivityEntryTypesForGroups(
  groups: StaffActivityEntryGroupKey[]
): string[] | null {
  if (groups.length === 0) return null;
  return [
    ...new Set(
      groups.flatMap(
        (key) => STAFF_ACTIVITY_ENTRY_GROUPS.find((g) => g.key === key)?.entryTypes ?? []
      )
    ),
  ];
}

export function staffActivityEntryGroupForType(entryType: string): StaffActivityEntryGroupKey | null {
  return GROUP_BY_ENTRY_TYPE.get(entryType) ?? null;
}

export function staffActivityEntryGroupLabel(key: StaffActivityEntryGroupKey): string {
  return STAFF_ACTIVITY_ENTRY_GROUPS.find((g) => g.key === key)?.label ?? key;
}
