import { Suspense } from "react";
import { LeadsPageClient } from "./LeadsPageClient";

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-32 animate-pulse rounded bg-slate-700/80" />
          <div className="card h-24 animate-pulse bg-slate-800/50" />
          <div className="card h-96 animate-pulse bg-slate-800/50" />
        </div>
      }
    >
      <LeadsPageClient />
    </Suspense>
  );
}
