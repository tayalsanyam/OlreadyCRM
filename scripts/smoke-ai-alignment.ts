/**
 * Smoke test: AI reply quality + RAG references across support, sales, grievance, RM.
 * Uses existing DB seed data. Requires DATABASE_URL and OPENAI_API_KEY.
 *
 * Run: npx tsx scripts/smoke-ai-alignment.ts
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { TransactionSql } from "@/db/index";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(join(__dirname, "..", file), "utf8");
      for (const line of raw.split("\n")) {
        const m = /^([^#=]+)=(.*)$/.exec(line.trim());
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* optional */
    }
  }
}
loadEnv();

const FALLBACK_ONLY =
  process.argv.includes("--fallback") || process.env.AI_SMOKE_FALLBACK_ONLY === "1";
if (FALLBACK_ONLY) {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
}

let passed = 0;
let failed = 0;
let warned = 0;

function pass(msg: string) {
  passed++;
  console.log(`✓ ${msg}`);
}
function fail(msg: string) {
  failed++;
  console.log(`✗ ${msg}`);
}
function warn(msg: string) {
  warned++;
  console.log(`⚠ ${msg}`);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function sourcesMatch(titles: string[], expected: string[]): boolean {
  const joined = titles.join(" ").toLowerCase();
  return expected.some((e) => joined.includes(e.toLowerCase()));
}

function check(label: string, ok: boolean, detail: string) {
  if (ok) pass(`${label}: ${detail}`);
  else fail(`${label}: ${detail}`);
}

function isLegacyBadFallback(text: string): boolean {
  return (
    /Olready connects verified bridal leads to partner MUAs with plan-based exposure/i.test(text) ||
    /Suggested response for:/i.test(text) ||
    /^\[(policy_helper|issue_analysis|triage)\]/im.test(text) ||
    /Suggested verification questions:/i.test(text)
  );
}

async function discoverSeed(tx: TransactionSql) {
  const [docCount] = await tx<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM sales.ai_documents
  `;
  const [policyCount] = await tx<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM support.policy_documents
  `;

  const [activeMua] = await tx<
    { id: string; name: string; phone: string | null; planTier: string | null }[]
  >`
    SELECT id, name, phone, plan_tier::text AS "planTier"
    FROM muas
    WHERE plan_tier IS NOT NULL AND status = 'active'
    ORDER BY name
    LIMIT 1
  `;

  const [prospectPipeline] = await tx<
    { id: string; stage: string; muaName: string; phone: string | null }[]
  >`
    SELECT p.id, p.stage, m.name AS "muaName", m.phone
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.status = 'active'
    ORDER BY p.updated_at DESC
    LIMIT 1
  `;

  const [ticket] = await tx<
    { id: string; category: string; complaintText: string; muaId: string | null }[]
  >`
    SELECT id, category, complaint_text AS "complaintText", mua_id AS "muaId"
    FROM support.tickets
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const [rmLead] = await tx<
    {
      id: string;
      brideName: string;
      city: string;
      region: string;
      status: string;
      phone: string;
    }[]
  >`
    SELECT id, bride_name AS "brideName", city, region, status::text AS status, phone
    FROM bride_leads
    WHERE status IN ('assigned', 'verified')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return {
    docCount: docCount?.n ?? 0,
    policyCount: policyCount?.n ?? 0,
    activeMua,
    prospectPipeline,
    ticket,
    rmLead,
  };
}

async function main() {
  const { withTransaction } = await import("@/db/index");
  const { runCarePublicChat } = await import("@/lib/care-public-chat");
  const { runSalesAiChat } = await import("@/lib/sales-ai");
  const { runTicketAi } = await import("@/lib/ticket-ai");
  const { runRmAiAssist } = await import("@/lib/rm-ai");
  const { buildTicketContext } = await import("@/lib/ticket-context");
  const {
    formatVisitorContextForAi,
    SUPPORT_SEGMENT_LABELS,
    resolveSupportChatIntake,
  } = await import("@/lib/support-chat-intake");
  type SupportVisitorSegment = import("@/lib/support-chat-intake").SupportVisitorSegment;

  async function runSupportScenario(
    tx: TransactionSql,
    label: string,
    input: { name: string; phone: string; visitorKind: "mua" | "bride"; message: string },
    checks: {
      maxWords?: number;
      mustInclude?: RegExp[];
      mustNotInclude?: RegExp[];
      expectSources?: string[];
      minSources?: number;
    },
  ) {
    console.log(`\n── Support: ${label} ──`);
    const intake = await resolveSupportChatIntake(tx, input);
    const segment = intake.segment as SupportVisitorSegment;
    const visitorContext = formatVisitorContextForAi({
      name: input.name,
      phone: input.phone,
      visitorKind: input.visitorKind,
      segment,
      segmentLabel: SUPPORT_SEGMENT_LABELS[segment],
      contextSnapshot: intake.contextSnapshot,
    });

    const ai = await runCarePublicChat(tx, {
      message: input.message,
      visitorContext,
      visitorName: input.name,
      segment,
      contextSnapshot: intake.contextSnapshot,
    });

    console.log(`  Segment: ${segment}`);
    console.log(`  Sources: ${ai.docTitles.length ? ai.docTitles.join(", ") : "(none)"}`);
    console.log(`  Reply (${wordCount(ai.reply)} words):\n  ${ai.reply.replace(/\n/g, "\n  ")}\n`);

    if (checks.minSources !== undefined) {
      check(
        `${label} — RAG sources`,
        ai.docTitles.length >= checks.minSources,
        ai.docTitles.length >= checks.minSources
          ? `${ai.docTitles.length} doc(s): ${ai.docTitles.join(", ")}`
          : `expected ≥${checks.minSources}, got ${ai.docTitles.length}`,
      );
    }

    if (checks.expectSources?.length) {
      check(
        `${label} — expected doc refs`,
        sourcesMatch(ai.docTitles, checks.expectSources),
        sourcesMatch(ai.docTitles, checks.expectSources)
          ? checks.expectSources.join(" or ")
          : `missing in [${ai.docTitles.join(", ")}]`,
      );
    }

    if (checks.maxWords) {
      const wc = wordCount(ai.reply);
      check(
        `${label} — length`,
        wc <= checks.maxWords,
        wc <= checks.maxWords ? `${wc} words (≤${checks.maxWords})` : `${wc} words exceeds ${checks.maxWords}`,
      );
    }

    for (const p of checks.mustInclude ?? []) {
      check(`${label} — includes ${p}`, hasAny(ai.reply, [p]), hasAny(ai.reply, [p]) ? "ok" : `missing ${p}`);
    }
    for (const p of checks.mustNotInclude ?? []) {
      check(`${label} — avoids ${p}`, !hasAny(ai.reply, [p]), !hasAny(ai.reply, [p]) ? "ok" : `found ${p}`);
    }
    const validSources = ["openai", "claude", "fallback", "handoff"] as const;
    check(
      `${label} — replySource`,
      Boolean(ai.replySource && validSources.includes(ai.replySource as (typeof validSources)[number])),
      ai.replySource ?? "missing",
    );
    if (FALLBACK_ONLY) {
      check(`${label} — fallback mode`, ai.replySource === "fallback", ai.replySource ?? "missing");
    } else {
      check(
        `${label} — LLM source`,
        ai.replySource === "openai" || ai.replySource === "claude",
        ai.replySource ?? "missing",
      );
    }
  }

  console.log("AI alignment smoke test\n");
  if (FALLBACK_ONLY) console.log("(fallback-only mode — OpenAI disabled)\n");

  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL not set");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    warn("OPENAI_API_KEY not set — replies will be fallbacks only");
  }

  await withTransaction(async (tx) => {
    const seed = await discoverSeed(tx);
    console.log(`Knowledge: ${seed.docCount} sales docs, ${seed.policyCount} policy docs`);
    if (seed.docCount === 0) warn("No sales.ai_documents — run npm run db:seed-ai-knowledge");

    await runSupportScenario(
      tx,
      "Prospect — how leads work",
      {
        name: "Priya",
        phone: "9999900001",
        visitorKind: "mua",
        message: "How do bridal leads work for makeup artists on Olready?",
      },
      {
        maxWords: 130,
        minSources: 1,
        expectSources: ["Sales", "Plans", "Toolkit"],
        mustInclude: [/\b(push|lead|profile|unlock|plan)\b/i],
        mustNotInclude: [/authorized Olready team member/i, /I'd be happy to help/i],
      },
    );

    if (seed.activeMua?.phone) {
      await runSupportScenario(
        tx,
        "Active partner — reversal process",
        {
          name: seed.activeMua.name.split(/\s+/)[0] ?? "Partner",
          phone: seed.activeMua.phone.replace(/\D/g, "").slice(-10),
          visitorKind: "mua",
          message: "How do I report a lead reversal for a non-responsive bride?",
        },
        {
          maxWords: 130,
          minSources: 1,
          mustInclude: [/\b(reversal|report|concern|submit)\b/i],
          mustNotInclude: [/we approve your reversal/i, /authorized Olready team member/i],
        },
      );
    } else {
      warn("No active MUA with phone — skipping partner support scenario");
    }

    if (seed.rmLead) {
      await runSupportScenario(
        tx,
        "Bride — trial guidance",
        {
          name: "Ananya",
          phone: seed.rmLead.phone.replace(/\D/g, "").slice(-10),
          visitorKind: "bride",
          message: "What should I ask during a makeup trial before my wedding?",
        },
        {
          maxWords: 130,
          minSources: 1,
          expectSources: ["Bride"],
          mustNotInclude: [/authorized Olready team member/i],
        },
      );
    }

    console.log("\n── Support: Signup handoff ──");
    const signup = await runCarePublicChat(tx, {
      message: "I want to sign up and join Olready as an MUA",
      visitorName: "Rahul",
      segment: "potential_mua",
      visitorContext: "Prospect MUA",
    });
    console.log(`  Reply: ${signup.reply}`);
    check(
      "Signup handoff — crisp",
      wordCount(signup.reply) <= 80 && /24\s*h|24\s*hour|team will reach/i.test(signup.reply),
      `${wordCount(signup.reply)} words`,
    );
    check("Signup handoff — replySource", signup.replySource === "handoff", signup.replySource ?? "missing");

    console.log("\n── Sales AI ──");
    if (seed.prospectPipeline) {
      const objection = await runSalesAiChat(tx, {
        message:
          "Write a WhatsApp follow-up — MUA said Instagram leads are enough and Olready is expensive",
        pipelineId: seed.prospectPipeline.id,
      });
      console.log(`  Pipeline: ${seed.prospectPipeline.muaName} @ ${seed.prospectPipeline.stage}`);
      console.log(`  Sources: ${objection.usedDocs.join(", ") || "(none)"}`);
      console.log(`  Reply (${wordCount(objection.reply)} words):\n  ${objection.reply.slice(0, 400).replace(/\n/g, "\n  ")}…\n`);

      check("Sales — RAG refs", objection.usedDocs.length > 0, objection.usedDocs.join(", ") || "none");
      check(
        "Sales — objection reply",
        !/I'd be happy to help/i.test(objection.reply) &&
          objection.reply.trim().length > 40 &&
          !/\[MUA Name\]/i.test(objection.reply),
        seed.prospectPipeline.muaName
          ? `no placeholders (MUA: ${seed.prospectPipeline.muaName})`
          : "actionable",
      );

      const nextStep = await runSalesAiChat(tx, {
        message: "What should I do next for this MUA?",
        pipelineId: seed.prospectPipeline.id,
      });
      check(
        "Sales — stage-aware next action",
        new RegExp(seed.prospectPipeline.stage.replace(/_/g, "[_\\s]?"), "i").test(nextStep.reply) ||
          /next|follow|call|demo|onboard/i.test(nextStep.reply),
        "stage or next-step referenced",
      );
      check("Sales objection — not legacy fallback", !isLegacyBadFallback(objection.reply), "ok");
      check("Sales next step — not legacy fallback", !isLegacyBadFallback(nextStep.reply), "ok");
    } else {
      warn("No sales.pipeline row — skipping sales AI");
    }

    console.log("\n── Grievance AI ──");
    const complaint =
      seed.ticket?.complaintText ??
      "MUA claims lead was already booked on Instagram before we pushed. Wants reversal credit.";
    const category = seed.ticket?.category ?? "lead_reversal";
    const ctx = seed.ticket?.muaId
      ? await buildTicketContext(tx, seed.ticket.muaId)
      : await buildTicketContext(tx, null);

    for (const mode of ["policy_helper", "issue_analysis"] as const) {
      const ai = await runTicketAi(tx, {
        mode,
        message: mode === "policy_helper" ? "When is a lead reversal eligible?" : undefined,
        complaintText: complaint,
        category,
        context: ctx,
      });
      console.log(`  Mode: ${mode}`);
      console.log(`  Sources: ${ai.docTitles.join(", ") || "(none)"}`);
      console.log(
        `  Reply (${wordCount(ai.response)} words):\n  ${ai.response.slice(0, 350).replace(/\n/g, "\n  ")}…\n`,
      );

      check(`Grievance ${mode} — sources`, ai.docTitles.length > 0, ai.docTitles.join(", ") || "none");
      check(
        `Grievance ${mode} — crisp`,
        wordCount(ai.response) <= 220 &&
          !/I'd be happy to help/i.test(ai.response) &&
          !/^Output:\s*/im.test(ai.response),
        `${wordCount(ai.response)} words`,
      );
      if (mode === "policy_helper") {
        check(
          "Grievance policy — reversal topic",
          /\b(reversal|eligible|policy|lead)\b/i.test(ai.response),
          "on-topic",
        );
      }
      check(`Grievance ${mode} — not legacy fallback`, !isLegacyBadFallback(ai.response), "ok");
    }

    const draft = await runTicketAi(tx, {
      mode: "response_draft",
      message: "Draft holding reply — need ledger review",
      complaintText: complaint,
      category,
      context: ctx,
    });
    check(
      "Grievance response_draft — format",
      Boolean(draft.emailDraft?.subject && draft.emailDraft.body),
      draft.emailDraft?.subject?.slice(0, 60) ?? "parse failed",
    );

    console.log("\n── RM AI ──");
    if (seed.rmLead) {
      for (const ctxMode of ["verification", "makeup"] as const) {
        const q =
          ctxMode === "verification"
            ? "Bride says she already booked another artist for wedding but wants trial pricing"
            : "Bride wants soft glam for outdoor day wedding in Delhi heat";
        const ai = await runRmAiAssist(tx, {
          message: q,
          context: ctxMode,
          lead: {
            brideName: seed.rmLead.brideName,
            city: seed.rmLead.city,
            region: seed.rmLead.region,
            status: seed.rmLead.status,
          },
        });
        console.log(`  Mode: ${ctxMode} | Lead: ${seed.rmLead.brideName}`);
        console.log(`  Sources: ${ai.docNames.join(", ") || "(none)"}`);
        console.log(
          `  Reply (${wordCount(ai.reply)} words):\n  ${ai.reply.slice(0, 300).replace(/\n/g, "\n  ")}…\n`,
        );

        check(`RM ${ctxMode} — sources`, ai.docNames.length > 0, ai.docNames.join(", ") || "none");
        check(
          `RM ${ctxMode} — crisp`,
          wordCount(ai.reply) <= 180 && !/I'd be happy to help/i.test(ai.reply),
          `${wordCount(ai.reply)} words`,
        );
        check(`RM ${ctxMode} — not legacy fallback`, !isLegacyBadFallback(ai.reply), "ok");
      }
    } else {
      warn("No bride_leads row — skipping RM AI");
    }
  });

  console.log(`\n── Summary ──`);
  console.log(`Passed: ${passed} | Failed: ${failed} | Warnings: ${warned}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
