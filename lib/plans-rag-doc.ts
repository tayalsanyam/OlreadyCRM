import fs from "node:fs";
import path from "node:path";
import { sql } from "@/db/index";
import { LEGAL_ENTITY, RAG_DIR } from "@/lib/rag-content";
import { PLAN_DEFAULT_CAP } from "@/lib/sales-plan-details";

export const PLANS_PRICING_FILENAME = "Olready_Plans_Pricing.md";

type PlanTierRow = {
  tier: string;
  name: string;
  weeklyCap: number;
  monthlyPushTarget: number | null;
  assuredBookings: number | null;
  listPriceInr: string | null;
  planSummary: string | null;
  sortOrder: number;
  active: boolean;
};

const DEFAULT_SUMMARIES: Record<string, string> = {
  highest_privy:
    "Top exposure tier — maximum platform visibility, priority recommendation opportunity, RM support, and social recognition.",
  phoenix_2:
    "High exposure tier — strong lead access, RM support, and growth-focused servicing for established MUAs.",
  phoenix:
    "Strong exposure tier — regular platform opportunity flow with RM support and structured lead access.",
  pro: "Entry-growth tier — structured but controlled lead access with RM guidance.",
  prime: "Starter tier — trial exposure to explore Olready with limited weekly pushes.",
};

function formatInr(value: string | null): string {
  if (!value) return "Contact Team Olready for current pricing";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "Contact Team Olready for current pricing";
  return `₹${n.toLocaleString("en-IN")}`;
}

export function buildPlansPricingMarkdown(plans: PlanTierRow[]): string {
  const active = plans.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder);

  const lines = [
    "---",
    "title: Olready MUA Plans — Pricing & Details",
    `legal_entity: ${LEGAL_ENTITY}`,
    "visibility: PUBLIC_SUPPORT",
    "source: Admin plan tiers (Config) + Olready plan architecture",
    "pricing_allowed: true",
    "---",
    "",
    "# Olready MUA Plans — Pricing & Details",
    "",
    "Authoritative plan reference for public support AI. Use **only** the prices and summaries in this document when answering plan or pricing questions. Do not invent amounts.",
    "",
    "## Plan comparison",
    "",
    "| Plan | List price | Weekly profile pushes | Monthly push target | Default lead cap | Assured bookings | What's included |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const p of active) {
    const cap = PLAN_DEFAULT_CAP[p.name] ?? PLAN_DEFAULT_CAP[p.tier] ?? "—";
    const summary =
      p.planSummary?.trim() ||
      DEFAULT_SUMMARIES[p.tier] ||
      "Olready partner plan with platform visibility and lead access.";
    lines.push(
      `| ${p.name} | ${formatInr(p.listPriceInr)} | ${p.weeklyCap}/week | ${p.monthlyPushTarget ?? "—"} | ${cap} | ${p.assuredBookings ?? "—"} | ${summary.replace(/\|/g, "/")} |`,
    );
  }

  lines.push(
    "",
    "## How to discuss plans (public)",
    "",
    "- Share plan **name, price (from table above), caps, and summary** when asked about pricing or what's included.",
    "- Plans define exposure level, RM support, weekly push limits, and lead access — not guaranteed bookings unless assured bookings is listed.",
    "- Final commercial terms may vary by city, duration, and sales approval — direct custom quotes to Team Olready.",
    "- Do not quote prices from other documents; this table is the approved public pricing source.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

export async function fetchPlanTiersForRag(): Promise<PlanTierRow[]> {
  return sql<PlanTierRow[]>`
    SELECT
      tier::text AS tier,
      name,
      weekly_cap AS "weeklyCap",
      monthly_push_target AS "monthlyPushTarget",
      assured_bookings AS "assuredBookings",
      list_price_inr::text AS "listPriceInr",
      plan_summary AS "planSummary",
      sort_order AS "sortOrder",
      active
    FROM plan_tiers
    ORDER BY sort_order ASC
  `;
}

export async function syncPlansPricingRagDoc(): Promise<string> {
  const plans = await fetchPlanTiersForRag();
  const content = buildPlansPricingMarkdown(plans);
  const filePath = path.join(RAG_DIR, PLANS_PRICING_FILENAME);

  fs.mkdirSync(RAG_DIR, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");

  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM support.policy_documents
    WHERE source_filename = ${PLANS_PRICING_FILENAME}
    LIMIT 1
  `;

  if (existing) {
    await sql`
      UPDATE support.policy_documents
      SET title = 'Olready Plans — Pricing & Details',
          category = 'plans',
          content_text = ${content},
          active = true,
          updated_at = NOW()
      WHERE id = ${existing.id}::uuid
    `;
  } else {
    await sql`
      INSERT INTO support.policy_documents (title, category, content_text, source_filename, active)
      VALUES (
        'Olready Plans — Pricing & Details',
        'plans',
        ${content},
        ${PLANS_PRICING_FILENAME},
        true
      )
    `;
  }

  return content;
}
