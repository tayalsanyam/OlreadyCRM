"use client";

import { CallyzerLoginSync } from "@/components/layout/CallyzerLoginSync";

/** Client-only shell pieces for the app layout (avoids RSC/client boundary issues). */
export function AppShellClient() {
  return <CallyzerLoginSync />;
}
