import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminGrievanceConfigClient } from "@/components/admin/AdminGrievanceConfigClient";

export default async function AdminGrievanceAiGuidancePage() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "owner")) {
    redirect("/login");
  }

  return <AdminGrievanceConfigClient />;
}
