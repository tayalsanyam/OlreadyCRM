import type { TransactionSql } from "@/db/index";
import { applyAdminPlanToMua } from "@/lib/admin-apply-plan";
import { parsePlanTier } from "@/lib/mua-import";
import type { Region } from "@/lib/types";

/** Row from sales.onboarding (postgres.camel → camelCase keys). */
export type OnboardingPlanActivationRow = {
  plan: string | null;
  leadCap: number | null;
  leadBudget: string | null;
  states: string[] | null;
  regions: string[] | null;
  cities: string[] | null;
  socialMedia: string | null;
  durationEnd: string | Date | null;
};

function planExpiryYmd(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const trimmed = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return match?.[1] ?? (trimmed || null);
}

/** Apply sales.onboarding plan snapshot to the MUA (same fields as admin plan assign). */
export async function applyOnboardingPlanOnActivation(
  tx: TransactionSql,
  muaId: string,
  actorId: string,
  pipelineId: string,
  onb: OnboardingPlanActivationRow,
  planRmId?: string | null,
): Promise<void> {
  const planTier = parsePlanTier(onb.plan ?? "");
  if (!planTier) {
    throw new Error(`Invalid or missing plan in onboarding: ${onb.plan ?? "—"}`);
  }

  const planExpiry = planExpiryYmd(onb.durationEnd);
  if (!planExpiry) {
    throw new Error("Plan duration end is required before activation");
  }

  const social = onb.socialMedia?.trim() ?? "";

  await applyAdminPlanToMua(tx, muaId, actorId, {
    planTier,
    planExpiry,
    city: onb.cities?.[0]?.trim() || null,
    instagram: social || null,
    leadCap: onb.leadCap,
    leadBudget: onb.leadBudget,
    states: onb.states ?? [],
    regions: (onb.regions ?? []) as Region[],
    cities: onb.cities ?? [],
    note: `Plan activated from pipeline ${pipelineId}`,
  }, { skipAcquisitionGraduation: true });

  if (planRmId) {
    await tx`
      UPDATE muas SET plan_rm_id = ${planRmId}::uuid WHERE id = ${muaId}::uuid
    `;
  }
}
