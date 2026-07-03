import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isDayEndRequiredRole } from "@/lib/day-end";
import { DayEndPageClient } from "@/components/day-end/DayEndPageClient";

export default async function DayEndPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isDayEndRequiredRole(session.role)) {
    redirect("/");
  }

  return <DayEndPageClient user={session} />;
}
