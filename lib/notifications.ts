import type { TransactionSql } from "@/db/index";

export async function createNotification(
  tx: TransactionSql,
  params: { userId: string; message: string; link?: string }
): Promise<void> {
  await tx`
    INSERT INTO notifications (staff_id, message, link)
    VALUES (
      ${params.userId}::uuid,
      ${params.message},
      ${params.link ?? null}
    )
  `;
}
