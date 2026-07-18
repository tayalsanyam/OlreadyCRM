import { todayIstYmd } from "@/lib/day-end";
import { rmBootstrapStorageKey } from "@/lib/rm-session-bootstrap-storage";
import type { SessionUser } from "@/lib/types";

const RM_BOOTSTRAP_ROLES = new Set<SessionUser["role"]>([
  "regionalRm",
  "commissionRm",
]);

let bootstrapInFlight: Promise<void> | null = null;

export function isRmBootstrapRole(role: string): boolean {
  return RM_BOOTSTRAP_ROLES.has(role as SessionUser["role"]);
}

export function hasRmBootstrapToday(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return (
    sessionStorage.getItem(rmBootstrapStorageKey(userId, todayIstYmd())) === "1"
  );
}

/** Run POST /api/me/rm-bootstrap at most once per IST day per browser tab. */
export async function ensureRmBootstrap(
  user: Pick<SessionUser, "userId" | "role">
): Promise<void> {
  if (!isRmBootstrapRole(user.role)) return;
  if (hasRmBootstrapToday(user.userId)) return;

  if (bootstrapInFlight) {
    await bootstrapInFlight;
    return;
  }

  bootstrapInFlight = (async () => {
    const res = await fetch("/api/me/rm-bootstrap", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? `Bootstrap failed (${res.status})`);
    }
    sessionStorage.setItem(
      rmBootstrapStorageKey(user.userId, todayIstYmd()),
      "1"
    );
  })();

  try {
    await bootstrapInFlight;
  } finally {
    bootstrapInFlight = null;
  }
}
