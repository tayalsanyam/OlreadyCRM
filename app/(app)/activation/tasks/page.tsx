import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SalesTasksClient } from "@/app/(app)/sales/tasks/SalesTasksClient";

export default async function ActivationTasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "salesActivation" && session.role !== "admin") {
    redirect("/login");
  }
  return <SalesTasksClient role={session.role} />;
}
