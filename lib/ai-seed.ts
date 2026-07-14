import { sql } from "@/db/index";
import {
  SALES_AI_DOCS,
  SUPPORT_POLICY_DOCS,
  ensureSalesToolkitFile,
  readRagFile,
} from "@/lib/rag-content";

async function resolveSeedStaffId(): Promise<string> {
  const [admin] = await sql<{ id: string }[]>`
    SELECT id FROM staff
    WHERE email = 'admin@olready.in'
    LIMIT 1
  `;
  if (admin?.id) return admin.id;

  const [fallback] = await sql<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role IN ('admin', 'owner')
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (!fallback?.id) {
    throw new Error("No admin/owner staff row found for sales.ai_documents uploaded_by");
  }
  return fallback.id;
}

async function seedSupportPolicyDocs() {
  const filenames = SUPPORT_POLICY_DOCS.map((d) => d.file);

  for (const doc of SUPPORT_POLICY_DOCS) {
    const content = readRagFile(doc.file);

    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM support.policy_documents
      WHERE source_filename = ${doc.file}
      LIMIT 1
    `;

    if (existing) {
      await sql`
        UPDATE support.policy_documents
        SET title = ${doc.title},
            category = ${doc.category},
            content_text = ${content},
            active = true,
            updated_at = NOW()
        WHERE id = ${existing.id}::uuid
      `;
    } else {
      await sql`
        INSERT INTO support.policy_documents (title, category, content_text, source_filename, active)
        VALUES (${doc.title}, ${doc.category}, ${content}, ${doc.file}, true)
      `;
    }
  }

  await sql`
    UPDATE support.policy_documents
    SET active = false, updated_at = NOW()
    WHERE source_filename IS NOT NULL
      AND source_filename <> ALL(${filenames})
  `;
}

async function seedSalesAiDocs(staffId: string) {
  ensureSalesToolkitFile();

  await sql`DELETE FROM sales.ai_documents`;

  for (const doc of SALES_AI_DOCS) {
    const content = readRagFile(doc.file);
    await sql`
      INSERT INTO sales.ai_documents (filename, content_text, uploaded_by)
      VALUES (${doc.file}, ${content}, ${staffId}::uuid)
    `;
  }
}

export async function seedAiKnowledge(): Promise<void> {
  const staffId = await resolveSeedStaffId();
  await seedSupportPolicyDocs();
  await seedSalesAiDocs(staffId);
}
