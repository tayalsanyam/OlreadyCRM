"use client";

import { useEffect, useRef } from "react";
import { ensureRmBootstrap } from "@/lib/rm-session-bootstrap-client";
import type { SessionUser } from "@/lib/types";

/**
 * Once per IST calendar day per browser tab: reconcile lead lifecycle and ensure RM tasks.
 * Mirrors CallyzerLoginSync — background, non-blocking.
 */
export function RmSessionBootstrap({ user }: { user: SessionUser }) {
  const scheduled = useRef(false);

  useEffect(() => {
    if (scheduled.current) return;
    scheduled.current = true;

    void ensureRmBootstrap(user).catch((error) => {
      console.warn("[RmSessionBootstrap]", error);
      scheduled.current = false;
    });
  }, [user.userId, user.role]);

  return null;
}
