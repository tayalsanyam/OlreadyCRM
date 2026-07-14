import { Suspense } from "react";
import { ActivationAdminWorkbench } from "@/components/activation/ActivationAdminWorkbench";
import { AdminActivationNav } from "@/components/admin/AdminActivationNav";

export default function AdminSalesActivationPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <AdminActivationNav />
      <Suspense fallback={<p className="text-sm text-slate-muted">Loading activation…</p>}>
        <ActivationAdminWorkbench />
      </Suspense>
    </div>
  );
}
