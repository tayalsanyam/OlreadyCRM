import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminEmailTemplatesClient } from "@/components/admin/AdminEmailTemplatesClient";

export default async function AdminGrievanceEmailTemplatesPage() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "owner")) {
    redirect("/login");
  }

  return <AdminEmailTemplatesClient />;
}
