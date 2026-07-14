import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TeamDayEndReportClient } from "@/components/day-end/TeamDayEndReportClient";

export default async function SalesTeamDayEndReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "salesTl") redirect("/sales/reports");

  return <TeamDayEndReportClient currentUserId={session.userId} />;
}
