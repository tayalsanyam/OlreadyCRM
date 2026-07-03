import { TeamTasksPanel } from "@/components/ops/TeamTasksPanel";

export default function UploadTasksPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">My Tasks</h1>
        <p className="text-sm text-slate-muted">
          Team tasks and lead re-verification items assigned to you.
        </p>
      </div>
      <TeamTasksPanel />
    </div>
  );
}
