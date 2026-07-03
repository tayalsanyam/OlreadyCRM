import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { GrievanceReportsClient } from "@/components/admin/grievances/GrievanceReportsClient";

export default async function CareGrievanceReportsPage() {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "careAgent" && session.role !== "admin" && session.role !== "owner")
  ) {
    redirect("/login");
  }

  return <GrievanceReportsClient />;
}
