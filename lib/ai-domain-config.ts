import type { TransactionSql } from "@/db/index";
import {
  AI_DOMAINS,
  getAiDomain,
  type AiDomain,
  type AiDomainMeta,
} from "@/lib/ai-domains";

export type AiDomainOverrideRow = {
  domain: AiDomain;
  systemPrompt: string | null;
  guardrails: string[] | null;
  updatedAt: string | null;
};

export function mergeAiDomain(
  base: AiDomainMeta,
  override?: Pick<AiDomainOverrideRow, "systemPrompt" | "guardrails"> | null,
): AiDomainMeta {
  if (!override) return base;

  const prompt = override.systemPrompt?.trim();
  const guardrails =
    Array.isArray(override.guardrails) && override.guardrails.length
      ? override.guardrails.filter((g) => typeof g === "string" && g.trim())
      : null;

  return {
    ...base,
    systemPrompt: prompt || base.systemPrompt,
    guardrails: guardrails ?? base.guardrails,
  };
}

export async function loadAiDomainOverrides(
  tx: TransactionSql,
): Promise<Partial<Record<AiDomain, AiDomainOverrideRow>>> {
  const rows = await tx<
    {
      domain: AiDomain;
      systemPrompt: string | null;
      guardrails: string[] | null;
      updatedAt: string | null;
    }[]
  >`
    SELECT
      domain,
      system_prompt AS "systemPrompt",
      guardrails,
      updated_at AS "updatedAt"
    FROM sales.ai_domain_overrides
  `;

  const map: Partial<Record<AiDomain, AiDomainOverrideRow>> = {};
  for (const row of rows) {
    const id = row.domain as AiDomain;
    if (id in AI_DOMAINS) {
      map[id] = { ...row, domain: id };
    }
  }
  return map;
}

export async function getResolvedAiDomain(
  tx: TransactionSql,
  id: AiDomain,
): Promise<AiDomainMeta> {
  const overrides = await loadAiDomainOverrides(tx);
  return mergeAiDomain(getAiDomain(id), overrides[id]);
}

export function listDefaultAiDomains(): AiDomainMeta[] {
  return Object.values(AI_DOMAINS);
}
