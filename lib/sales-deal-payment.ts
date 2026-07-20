import type { TransactionSql } from "@/db/index";
import type { PipelineStage } from "@/lib/types";

export type PaymentCloseStage = "Onboarding" | "Part Payment";

export function resolveQuotedDealAmount(
  quotedAmount?: number | null,
  paymentFallback?: number | null,
): number {
  const q = Number(quotedAmount ?? paymentFallback ?? 0);
  return Number.isFinite(q) && q > 0 ? q : 0;
}

export function isDealFullyPaid(totalPaid: number, quotedAmount: number): boolean {
  if (quotedAmount <= 0) return totalPaid > 0;
  return totalPaid + 0.009 >= quotedAmount;
}

export function resolvePaymentCloseStage(
  totalPaid: number,
  quotedAmount: number,
): PaymentCloseStage {
  return isDealFullyPaid(totalPaid, quotedAmount) ? "Onboarding" : "Part Payment";
}

export async function sumPipelinePayments(tx: TransactionSql, pipelineId: string): Promise<number> {
  const [row] = await tx<{ total: number }[]>`
    SELECT COALESCE(SUM(amount), 0)::numeric AS total
    FROM sales.payment_records
    WHERE pipeline_id = ${pipelineId}::uuid
  `;
  return Number(row?.total ?? 0);
}

export async function loadPipelineQuotedAmount(
  tx: TransactionSql,
  pipelineId: string,
): Promise<number> {
  const [row] = await tx<{ quoted: number | null }[]>`
    SELECT quoted_amount AS quoted FROM sales.onboarding WHERE pipeline_id = ${pipelineId}::uuid
  `;
  return resolveQuotedDealAmount(row?.quoted);
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function paymentBalanceLabel(quotedAmount: number, totalPaid: number): string {
  if (quotedAmount <= 0) return "Deal price not set";
  const balance = Math.max(0, quotedAmount - totalPaid);
  if (balance <= 0.009) return `Fully paid (${formatInr(quotedAmount)})`;
  return `${formatInr(totalPaid)} received · ${formatInr(balance)} balance on ${formatInr(quotedAmount)}`;
}

export function isPaymentCloseIntent(toStage: PipelineStage): boolean {
  return toStage === "Deal Closed";
}
