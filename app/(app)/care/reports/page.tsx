import { MuaLedgerReport } from "@/components/admin/reports/MuaLedgerReport";

export default function CareReportsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">MUA activity ledger</h1>
        <p className="text-sm text-slate-muted">
          MUA activity ledger across all MUAs — export summary or per-MUA detail. For grievance
          ticket metrics, see Grievance reports.
        </p>
      </div>
      <MuaLedgerReport apiBase="/api/admin/reports" />
    </div>
  );
}
