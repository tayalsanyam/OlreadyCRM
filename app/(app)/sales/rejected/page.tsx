import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/types";
import { SalesRejectedQueue } from "@/components/admin/sales/SalesRejectedQueue";

export default async function SalesRejectedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "salesTl") {
    redirect(ROLE_HOME.salesTl);
  }
  if (session.role !== "admin" && session.role !== "owner") {
    redirect(ROLE_HOME[session.role] ?? "/login");
  }
  return (
    <SalesRejectedQueue
      listUrl="/api/admin/sales/rejected"
      exportApiPath="/api/admin/sales/rejected"
      role="admin"
      title="Rejected MUAs"
      description="Review rejected pipeline records. Re-assign to a sales RM or junk to archive."
    />
  );
}
