/** IDs used by demo seed — safe to delete with db:clean-demo */
export const DEMO_MUA_DISPLAY_IDS = [
  "MUA-0001",
  "MUA-0002",
  "MUA-0003",
  "MUA-0004",
] as const;

export const DEMO_LEAD_DISPLAY_IDS = [
  "LD-00001",
  "LD-00002",
  "LD-00007",
  "LD-00009",
] as const;

/** Stored in bride_leads.source — tagged demo rows only */
export const DEMO_SOURCE_TAG = "demo_seed";
