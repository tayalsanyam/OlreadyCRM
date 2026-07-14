import { getSession } from "@/lib/auth";
import type { Region } from "@/lib/types";
import { RmQueueClient } from "./RmQueueClient";

export default async function RmQueuePage() {
  const session = await getSession();
  const allowedRegions = (
    session?.regions?.length
      ? session.regions
      : session?.region
        ? [session.region]
        : ["north"]
  ) as Region[];
  const defaultRegion = allowedRegions[0] ?? "north";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Lead Queue</h1>
        <p className="text-sm text-slate-muted">
          {allowedRegions.length > 1
            ? `${allowedRegions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ")} · auto-sorted by urgency`
            : `${defaultRegion.charAt(0).toUpperCase() + defaultRegion.slice(1)} region · auto-sorted by urgency`}
        </p>
      </div>
      <RmQueueClient
        defaultRegion={defaultRegion}
        allowedRegions={allowedRegions}
        lockRegion={allowedRegions.length <= 1}
        userRole={session?.role}
      />
    </div>
  );
}
