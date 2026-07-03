import type { SalesPipelineMuaType } from "@/lib/sales-pipeline-labels";

export function salesSegmentTheme(segment: SalesPipelineMuaType) {
  if (segment === "candidate") {
    return {
      label: "Potential",
      subtitle: "New MUAs in pipeline",
      banner: "border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50",
      pillActive: "border-teal-700 bg-teal-700 text-white shadow-sm",
      hint: "First-touch and conversion tasks for new leads.",
    };
  }
  if (segment === "renewal") {
    return {
      label: "Renewal",
      subtitle: "On plan · expiring in ~30 days",
      banner: "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50",
      pillActive: "border-amber-700 bg-amber-700 text-white shadow-sm",
      hint: "Renewal outreach while MUA is still active on plan.",
    };
  }
  return {
    label: "Re-engage",
    subtitle: "Existing MUAs · no active plan",
    banner: "border-violet-200 bg-gradient-to-r from-violet-50 to-amber-50",
    pillActive: "border-violet-700 bg-violet-700 text-white shadow-sm",
    hint: "Win-back tasks for expired-plan MUAs — prioritize contact recency.",
  };
}
