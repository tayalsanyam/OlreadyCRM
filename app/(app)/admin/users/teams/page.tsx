"use client";

import { AdminConfigUsersNav } from "@/components/admin/AdminConfigUsersNav";
import { AdminSalesTeamsPanel } from "@/components/admin/AdminSalesTeamsPanel";

export default function AdminUsersTeamsPage() {
  return (
    <div className="space-y-6">
      <AdminConfigUsersNav />
      <AdminSalesTeamsPanel />
    </div>
  );
}
