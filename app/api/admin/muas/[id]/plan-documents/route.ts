import { sanitizeUploadFilename, saveUploadFromFile } from "@/lib/file-storage";
import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { latestPipelineIdForMua } from "@/lib/admin-mua-plan-controls-pipeline";
import { bootstrapSalesPipelinesForMuas } from "@/lib/bootstrap-sales-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: muaId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("contractFile");
  const invoiceNumberRaw = form?.get("invoiceNumber");
  const invoiceNumber =
    typeof invoiceNumberRaw === "string" ? invoiceNumberRaw.trim() : "";

  if (!(file instanceof File) && !invoiceNumber) {
    return NextResponse.json(
      { data: null, error: "Provide an invoice number and/or contract file" },
      { status: 400 },
    );
  }

  if (file instanceof File) {
    if (file.size <= 0) {
      return NextResponse.json({ data: null, error: "Contract file is empty" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { data: null, error: "Unsupported file type. Use PDF, DOCX, JPG, or PNG." },
        { status: 400 },
      );
    }
  }

  try {
    const data = await withTransaction(async (tx) => {
      let pipelineId = await latestPipelineIdForMua(tx, muaId);
      if (!pipelineId) {
        const boot = await bootstrapSalesPipelinesForMuas(tx, [muaId], {
          actorId: auth.session.userId,
        });
        pipelineId = boot.created[0]?.pipelineId ?? (await latestPipelineIdForMua(tx, muaId));
      }
      if (!pipelineId) throw new Error("No sales pipeline linked to this MUA");

      await tx`
        INSERT INTO sales.activation_log (pipeline_id)
        VALUES (${pipelineId}::uuid)
        ON CONFLICT (pipeline_id) DO NOTHING
      `;

      if (invoiceNumber) {
        await tx`
          UPDATE sales.activation_log
          SET
            invoice_number = ${invoiceNumber},
            invoice_generated = true,
            invoice_generated_at = NOW()
          WHERE pipeline_id = ${pipelineId}::uuid
        `;
      }

      let contractUrl: string | null = null;
      if (file instanceof File) {
        const savedName = `${pipelineId}-${Date.now()}-${sanitizeUploadFilename(file.name)}`;
        contractUrl = (await saveUploadFromFile("contracts", savedName, file)).publicPath;

        await tx`
          UPDATE sales.activation_log
          SET
            contract_url = ${contractUrl},
            contract_uploaded_at = NOW(),
            contract_generated = true,
            contract_generated_at = COALESCE(contract_generated_at, NOW())
          WHERE pipeline_id = ${pipelineId}::uuid
        `;
      }

      const [row] = await tx<
        {
          invoiceGenerated: boolean;
          invoiceNumber: string | null;
          contractUrl: string | null;
        }[]
      >`
        SELECT
          COALESCE(invoice_generated, false) AS "invoiceGenerated",
          invoice_number AS "invoiceNumber",
          contract_url AS "contractUrl"
        FROM sales.activation_log
        WHERE pipeline_id = ${pipelineId}::uuid
        LIMIT 1
      `;
      return row ?? { invoiceGenerated: false, invoiceNumber: null, contractUrl: null };
    });

    return NextResponse.json({ data, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Document upload failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
