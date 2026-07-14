import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SalesTasksClient } from "./SalesTasksClient";

export default async function SalesTasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <SalesTasksClient role={session.role} />;
}
