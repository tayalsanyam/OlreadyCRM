"use client";

import { CallyzerLoginSync } from "@/components/layout/CallyzerLoginSync";
import { RmSessionBootstrap } from "@/components/layout/RmSessionBootstrap";
import type { SessionUser } from "@/lib/types";

/** Client-only shell pieces for the app layout (avoids RSC/client boundary issues). */
export function AppShellClient({ user }: { user: SessionUser }) {
  return (
    <>
      <CallyzerLoginSync />
      <RmSessionBootstrap user={user} />
    </>
  );
}
