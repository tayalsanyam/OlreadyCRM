import type { TransactionSql } from "@/db/index";
import { convertExpiredRenewalPipelines, processRenewalT30 } from "@/lib/sales-renewal-track";
import { processExpiredSalesPlans } from "@/lib/sales-plan-expiry";

/** Run T-30 renewal outreach, convert expired renewals, then post-expiry re-engage pipelines. */
export async function syncSalesPlanPipelines(tx: TransactionSql) {
  const renewalCreated = await processRenewalT30(tx);
  const renewalsConverted = await convertExpiredRenewalPipelines(tx);
  const reEngageCreated = await processExpiredSalesPlans(tx);
  return { renewalCreated, renewalsConverted, reEngageCreated };
}
