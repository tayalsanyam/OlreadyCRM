import { SalesRejectedQueue } from "@/components/admin/sales/SalesRejectedQueue";

export default function AdminSalesRejectedPage() {
  return (
    <SalesRejectedQueue
      listUrl="/api/admin/sales/rejected"
      exportApiPath="/api/admin/sales/rejected"
      role="admin"
    />
  );
}
