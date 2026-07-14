import { CallActivityReport } from "@/components/reports/CallActivityReport";

export default function UploadReportsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-brand">My reports</h1>
        <p className="text-sm text-slate-muted">Callyzer call activity for verification and follow-up calls.</p>
      </div>
      <CallActivityReport apiBase="/api/reports" />
    </div>
  );
}
