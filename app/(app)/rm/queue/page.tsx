import { getSession } from "@/lib/auth";
import { RmQueueClient } from "./RmQueueClient";

export default async function RmQueuePage() {
  const session = await getSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Lead Queue</h1>
        <p className="text-sm text-slate-muted">
          All assigned leads · auto-sorted by urgency
        </p>
      </div>
      <RmQueueClient userRole={session?.role} />
    </div>
  );
}
