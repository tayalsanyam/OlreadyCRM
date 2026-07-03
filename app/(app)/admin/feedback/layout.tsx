import { AdminFeedbackNav } from "@/components/admin/AdminFeedbackNav";

export default function AdminFeedbackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AdminFeedbackNav />
      {children}
    </div>
  );
}
