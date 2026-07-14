import { SalesPipelineView } from "@/components/sales/SalesPipelineView";

export default function SalesPipelinePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-brand">Sales Pipeline</h1>
        <p className="text-sm text-slate-muted">Potential, renewal (T-30), and re-engage (expired plan) MUAs in the sales funnel.</p>
      </div>
      <SalesPipelineView />
    </div>
  );
}
