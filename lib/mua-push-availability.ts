import type { MuaPushStatus } from "@/lib/types";

/** True when RM can create a new push for this MUA on the lead. */
export function isMuaAvailableToPush(mua: {
  leadPushStatus?: MuaPushStatus | null;
}): boolean {
  const status = mua.leadPushStatus;
  return !status || status === "closed";
}
