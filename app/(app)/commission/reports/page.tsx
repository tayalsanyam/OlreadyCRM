import { RoleReportsPage } from "@/components/reports/RoleReportsPage";

export default function CommissionReportsPage() {
  return (
    <RoleReportsPage
      title="My reports"
      subtitle="Lead journey, bookings, commission overdue, and MUA activity."
      showCommissionOverdue
    />
  );
}
