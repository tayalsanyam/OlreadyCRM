import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { AI_DOMAINS, type AiDomain } from "@/lib/ai-domains";
import { mergeAiDomain } from "@/lib/ai-domain-config";

const DOMAINS = new Set(Object.keys(AI_DOMAINS));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { domain: domainParam } = await params;
  if (!DOMAINS.has(domainParam)) {
    return NextResponse.json({ data: null, error: "Unknown AI domain" }, { status: 400 });
  }

  const domain = domainParam as AiDomain;
  const body = (await request.json().catch(() => ({}))) as {
    systemPrompt?: string;
    guardrails?: string[];
    reset?: boolean;
  };

  try {
    const data = await withTransaction(async (tx) => {
      if (body.reset) {
        await tx`DELETE FROM sales.ai_domain_overrides WHERE domain = ${domain}`;
        const base = AI_DOMAINS[domain];
        return {
          id: base.id,
          label: base.label,
          guardrails: base.guardrails,
          systemPrompt: base.systemPrompt,
          customized: false,
          overrideUpdatedAt: null,
        };
      }

      const systemPrompt =
        typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : undefined;
      const guardrails = Array.isArray(body.guardrails)
        ? body.guardrails.map((g) => String(g).trim()).filter(Boolean)
        : undefined;

      if (!systemPrompt) {
        throw new Error("System prompt is required");
      }
      if (!guardrails?.length) {
        throw new Error("At least one guardrail is required");
      }

      await tx`
        INSERT INTO sales.ai_domain_overrides (domain, system_prompt, guardrails, updated_by, updated_at)
        VALUES (
          ${domain},
          ${systemPrompt},
          ${tx.json(guardrails)},
          ${auth.session.userId}::uuid,
          NOW()
        )
        ON CONFLICT (domain)
        DO UPDATE SET
          system_prompt = EXCLUDED.system_prompt,
          guardrails = EXCLUDED.guardrails,
          updated_by = ${auth.session.userId}::uuid,
          updated_at = NOW()
      `;

      const [row] = await tx<
        { systemPrompt: string | null; guardrails: string[] | null; updatedAt: string }[]
      >`
        SELECT
          system_prompt AS "systemPrompt",
          guardrails,
          updated_at AS "updatedAt"
        FROM sales.ai_domain_overrides
        WHERE domain = ${domain}
      `;

      const merged = mergeAiDomain(AI_DOMAINS[domain], row);
      return {
        id: merged.id,
        label: merged.label,
        guardrails: merged.guardrails,
        systemPrompt: merged.systemPrompt,
        customized: true,
        overrideUpdatedAt: row?.updatedAt ?? null,
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
