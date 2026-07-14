import type postgres from "postgres";
import { clearRmTransactionalData } from "@/lib/clear-rm-data";

type Sql = postgres.Sql<Record<string, unknown>>;

export type WipeDatabaseResult = {
  staffRemoved: number;
  transactional: Awaited<ReturnType<typeof clearRmTransactionalData>>;
};

/**
 * Wipe all CRM/sales transactional rows and all staff users.
 * Keeps plan_tiers, sla_config, city_regions.
 */
export async function wipeDatabaseForDemoReset(sql: Sql): Promise<WipeDatabaseResult> {
  const transactional = await clearRmTransactionalData(sql);

  const removed = await sql<{ id: string }[]>`
    DELETE FROM staff RETURNING id
  `;

  return {
    staffRemoved: removed.length,
    transactional,
  };
}
