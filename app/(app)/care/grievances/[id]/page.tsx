import { Suspense } from "react";
import { TicketWorkspaceClient } from "./TicketWorkspaceClient";

export default function TicketPage() {
  return (
    <Suspense fallback={<p className="text-slate-muted">Loading ticket…</p>}>
      <TicketWorkspaceClient />
    </Suspense>
  );
}
