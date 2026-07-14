import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { getOpenAiModel, hasOpenAiKey } from "@/lib/ai-config";
import { AI_DOMAIN_LIST } from "@/lib/ai-domains";
import { loadAiDomainOverrides, mergeAiDomain } from "@/lib/ai-domain-config";
import { RAG_DIR } from "@/lib/rag-content";
import { seedAiKnowledge } from "@/lib/ai-seed";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const data = await withTransaction(async (tx) => {
    const salesRows = await tx<
      { filename: string; charCount: number; createdAt: string }[]
    >`
      SELECT filename, char_length(content_text)::int AS "charCount", created_at AS "createdAt"
      FROM sales.ai_documents
      ORDER BY created_at DESC
    `;

    const policyRows = await tx<
      {
        title: string;
        sourceFilename: string | null;
        category: string | null;
        active: boolean;
        charCount: number;
        updatedAt: string;
      }[]
    >`
      SELECT
        title,
        source_filename AS "sourceFilename",
        category,
        active,
        char_length(content_text)::int AS "charCount",
        updated_at AS "updatedAt"
      FROM support.policy_documents
      ORDER BY updated_at DESC
    `;

    const salesByFile = new Map<string, { filename: string; charCount: number; createdAt: string }>(
      salesRows.map((r: { filename: string; charCount: number; createdAt: string }) => [r.filename, r]),
    );
    const policyByFile = new Map<
      string,
      {
        title: string;
        sourceFilename: string | null;
        category: string | null;
        active: boolean;
        charCount: number;
        updatedAt: string;
      }
    >(
      policyRows
        .filter((r: { sourceFilename: string | null }) => r.sourceFilename)
        .map(
          (r: {
            title: string;
            sourceFilename: string | null;
            category: string | null;
            active: boolean;
            charCount: number;
            updatedAt: string;
          }) => [r.sourceFilename as string, r],
        ),
    );

    const overrides = await loadAiDomainOverrides(tx);

    const domains = AI_DOMAIN_LIST.map((domain) => {
      const resolved = mergeAiDomain(domain, overrides[domain.id]);
      const files = domain.ragSourceFiles.map((filename) => {
        const diskPath = path.join(RAG_DIR, filename);
        const onDisk = fs.existsSync(diskPath);
        const diskChars = onDisk ? fs.readFileSync(diskPath, "utf8").length : 0;

        const inSales = (domain.salesTableFiles as readonly string[]).includes(filename);
        const inPolicy = (domain.policyTableFiles as readonly string[]).includes(filename);
        const sales = inSales ? salesByFile.get(filename) : undefined;
        const policy = inPolicy ? policyByFile.get(filename) : undefined;

        const dbSynced = inSales
          ? Boolean(sales && sales.charCount > 0)
          : inPolicy
            ? Boolean(policy?.active && (policy?.charCount ?? 0) > 0)
            : false;

        return {
          filename,
          onDisk,
          diskChars,
          inSalesTable: inSales,
          inPolicyTable: inPolicy,
          dbCharCount: sales?.charCount ?? policy?.charCount ?? 0,
          dbSynced,
          dbUpdatedAt: policy?.updatedAt ?? sales?.createdAt ?? null,
        };
      });

      return {
        id: domain.id,
        label: domain.label,
        audience: domain.audience,
        description: domain.description,
        usedBy: domain.usedBy,
        guardrails: resolved.guardrails,
        systemPrompt: resolved.systemPrompt,
        temperature: domain.temperature,
        maxTokens: domain.maxTokens,
        customized: Boolean(overrides[domain.id]),
        overrideUpdatedAt: overrides[domain.id]?.updatedAt ?? null,
        files,
        allFilesSynced: files.every((f) => f.onDisk && f.dbSynced),
      };
    });

    return {
      model: getOpenAiModel(),
      hasOpenAiKey: hasOpenAiKey(),
      ragDir: "docs/RAG",
      seedCommand: "npm run db:seed-ai-knowledge",
      domains,
      salesDocuments: salesRows,
      policyDocuments: policyRows.filter((r: { active: boolean }) => r.active),
    };
  });

  return NextResponse.json({ data, error: null });
}

export async function POST() {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  await seedAiKnowledge();

  return NextResponse.json({
    data: { ok: true, message: "AI knowledge re-synced from docs/RAG" },
    error: null,
  });
}
