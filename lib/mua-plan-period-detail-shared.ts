import type { MuaPlanPortalPayload } from "@/lib/mua-plan-portal";

/** Client-safe plan period detail shape (no DB imports). */
export type MuaPlanPeriodDetail = {
  plan: MuaPlanPortalPayload["plan"];
  commercial: MuaPlanPortalPayload["commercial"];
  dealTerms: MuaPlanPortalPayload["dealTerms"];
  contactEmail: string | null;
  dataSource: "pipeline" | "tier_catalog";
  partialNote: string | null;
};

export function portalPayloadToPeriodDetail(
  payload: MuaPlanPortalPayload
): MuaPlanPeriodDetail {
  return {
    plan: payload.plan,
    commercial: payload.commercial,
    dealTerms: payload.dealTerms,
    contactEmail: payload.contactEmail,
    dataSource: payload.commercial.pipelineId ? "pipeline" : "tier_catalog",
    partialNote: null,
  };
}
