import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PendingEmailApprovalsClient } from "@/components/admin/grievances/PendingEmailApprovalsClient";

export default async function AdminPendingEmailApprovalsPage() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "owner")) {
    redirect("/login");
  }

  return <PendingEmailApprovalsClient />;
}
