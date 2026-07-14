import Link from "next/link";
import { AdminUploaderLeadsReport } from "@/components/admin/uploader/AdminUploaderLeadsReport";
import { Button } from "@/components/ui/Button";

export default function AdminUploaderLeadsReportPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Uploader leads report</h1>
          <p className="text-sm text-slate-muted">
            Leads added in a date range with current status, routing, contacts, and geography.
          </p>
        </div>
        <Link href="/admin/uploader/overview">
          <Button variant="secondary">Uploader overview</Button>
        </Link>
      </div>
      <AdminUploaderLeadsReport />
    </div>
  );
}
