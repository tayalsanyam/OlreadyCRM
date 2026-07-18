import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TasksPageClient } from "./TasksPageClient";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return <TasksPageClient user={session} />;
}
