/** Display labels for sales.pipeline mua_type segments. */
export function salesPipelineMuaTypeLabel(muaType: string): string {
  switch (muaType) {
    case "candidate":
      return "Potential";
    case "renewal":
      return "Renewal";
    case "re_engage":
      return "Re-engage";
    default:
      return muaType;
  }
}

export const SALES_PIPELINE_MUA_TYPES = ["candidate", "renewal", "re_engage"] as const;
export type SalesPipelineMuaType = (typeof SALES_PIPELINE_MUA_TYPES)[number];

export function junkCustomerSegmentLabel(segment: string | null | undefined): string {
  switch (segment) {
    case "prospect":
      return "Prospect (never customer)";
    case "ex_customer":
      return "Former customer";
    default:
      return "Unknown";
  }
}
