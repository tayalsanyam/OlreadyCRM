import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminSupportInquiriesClient } from "@/components/admin/AdminSupportInquiriesClient";

export default async function CareSupportInquiriesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (session.role === "admin" || session.role === "owner") {
    redirect("/admin/tasks?tab=support");
  }

  if (session.role !== "careAgent") {
    redirect("/login");
  }

  return <AdminSupportInquiriesClient />;
}
