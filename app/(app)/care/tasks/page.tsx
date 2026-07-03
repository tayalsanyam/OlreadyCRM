import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CareTasksPageClient } from "@/components/care/CareTasksPageClient";

export default async function CareTasksPage() {
  const session = await getSession();
  if (session?.role === "admin" || session?.role === "owner") {
    redirect("/admin/tasks?tab=mine");
  }

  const isOperator = session?.role === "careAgent";

  return <CareTasksPageClient isOperator={isOperator} />;
}
