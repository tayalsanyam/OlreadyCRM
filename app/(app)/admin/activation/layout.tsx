import { AdminActivationNav } from "@/components/admin/AdminActivationNav";

export default function AdminActivationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AdminActivationNav />
      {children}
    </div>
  );
}
