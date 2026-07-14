import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { AdminTasksClient } from "@/components/admin/AdminTasksClient";

export default async function AdminTasksPage() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "owner")) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<p className="text-sm text-slate-muted">Loading tasks…</p>}>
      <AdminTasksClient />
    </Suspense>
  );
}
