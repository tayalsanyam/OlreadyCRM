import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminAiHubClient } from "@/components/admin/AdminAiHubClient";

export default async function AdminAiPage() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "owner")) {
    redirect("/login");
  }

  return <AdminAiHubClient />;
}
