"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { CALLYZER_LOGIN_STAGGER_MS_MAX } from "@/lib/callyzer-sync-types";
import { syncCallyzerCalls } from "@/lib/callyzer-sync-client";

/**
 * After login, pull Callyzer calls for this user's phone since last sync (or start of today IST).
 * Runs once per session on non–day-end pages — does not block the UI.
 * Day-end owns its own sync; timer is cancelled when navigating there.
 */
export function CallyzerLoginSync() {
  const pathname = usePathname();
  const { toast } = useToast();
  const loginSyncScheduled = useRef(false);

  useEffect(() => {
    if (pathname?.startsWith("/day-end")) {
      return;
    }
    if (loginSyncScheduled.current) {
      return;
    }

    let cancelled = false;
    const delayMs = Math.floor(Math.random() * CALLYZER_LOGIN_STAGGER_MS_MAX);
    const timer = window.setTimeout(() => {
      if (cancelled || window.location.pathname.startsWith("/day-end")) return;
      loginSyncScheduled.current = true;
      void syncCallyzerCalls({ extended: false }).catch((error) => {
        const message = error instanceof Error ? error.message : "Callyzer sync failed";
        console.warn("[CallyzerLoginSync]", message);
        toast(message, "error");
      });
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, toast]);

  return null;
}
