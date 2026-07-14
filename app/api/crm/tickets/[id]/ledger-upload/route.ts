import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { parseLedgerRows } from "@/lib/ledger-excel-parse";
import { matchLedgerRows } from "@/lib/ledger-excel-match";

type RouteParams = { params: Promise<{ id: string }> };

async function persistLedgerUpload(
  ticketId: string,
  userId: string,
  opts: {
    rawContent: string;
    sourceType: "paste" | "excel";
    fileName?: string | null;
    muaId?: string | null;
  }
) {
  const rows = parseLedgerRows(opts.rawContent, opts.fileName ?? undefined);
  if (!rows.length) {
    return { error: "No valid rows — use Lead Name + Phone columns" as const };
  }

  return withTransaction(async (tx) => {
    const [ticket] = await tx<{ muaId: string | null }[]>`
      SELECT mua_id AS "muaId" FROM support.tickets WHERE id = ${ticketId}::uuid
    `;
    if (!ticket) return null;

    const muaId = opts.muaId ?? ticket.muaId;

    const [upload] = await tx<{ id: string }[]>`
      INSERT INTO support.lead_usage_uploads (
        ticket_id, mua_id, source_type, file_name, raw_content, uploaded_by
      )
      VALUES (
        ${ticketId}::uuid,
        ${muaId},
        ${opts.sourceType},
        ${opts.fileName ?? null},
        ${opts.rawContent},
        ${userId}::uuid
      )
      RETURNING id
    `;

    const matched = await matchLedgerRows(tx, rows, muaId);

    for (const row of matched) {
      await tx`
        INSERT INTO support.lead_usage_rows (
          upload_id, ticket_id, mua_id, lead_name, lead_phone,
          matched_lead_id, match_confidence, match_flags, row_number
        ) VALUES (
          ${upload.id}::uuid,
          ${ticketId}::uuid,
          ${muaId},
          ${row.leadName},
          ${row.leadPhone},
          ${row.matchedLeadId},
          ${row.matchConfidence},
          ${row.matchFlags},
          ${row.rowNumber}
        )
      `;
    }

    const tags = await tx<{ tags: string[] }[]>`
      SELECT tags FROM support.tickets WHERE id = ${ticketId}::uuid
    `;
    const nextTags = Array.from(new Set([...(tags[0]?.tags ?? []), "ledger-attached"]));
    await tx`
      UPDATE support.tickets SET tags = ${nextTags}, updated_at = NOW()
      WHERE id = ${ticketId}::uuid
    `;

    const matchedCount = matched.filter((r) => r.matchedLeadId).length;
    const sourceLabel = opts.sourceType === "excel" ? "file upload" : "paste";
    await tx`
      INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
      VALUES (
        ${ticketId}::uuid,
        ${userId}::uuid,
        ${`Lead usage ledger (${sourceLabel}${opts.fileName ? `: ${opts.fileName}` : ""}) — ${matched.length} rows, ${matchedCount} matched to CRM`},
        true
      )
    `;

    return { uploadId: upload.id, rows: matched };
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: ticketId } = await params;
  const contentType = request.headers.get("content-type") ?? "";

  let rawContent = "";
  let sourceType: "paste" | "excel" = "paste";
  let fileName: string | null = null;
  let muaId: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    muaId = (form.get("muaId") as string | null) || null;
    if (file instanceof File && file.size > 0) {
      rawContent = await file.text();
      fileName = file.name;
      sourceType = "excel";
    } else {
      rawContent = String(form.get("paste") ?? "").trim();
    }
  } else {
    const body = (await request.json().catch(() => ({}))) as {
      paste?: string;
      muaId?: string;
    };
    rawContent = body.paste?.trim() ?? "";
    muaId = body.muaId ?? null;
  }

  if (!rawContent) {
    return NextResponse.json({ data: null, error: "paste content or file is required" }, { status: 400 });
  }

  const data = await persistLedgerUpload(ticketId, auth.session.userId, {
    rawContent,
    sourceType,
    fileName,
    muaId,
  });

  if (data && "error" in data) {
    return NextResponse.json({ data: null, error: data.error }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null }, { status: 201 });
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: ticketId } = await params;

  const rows = await withTransaction(async (tx) => {
    return tx`
      SELECT
        r.id,
        r.lead_name AS "leadName",
        r.lead_phone AS "leadPhone",
        r.matched_lead_id AS "matchedLeadId",
        r.match_confidence AS "matchConfidence",
        r.match_flags AS "matchFlags",
        r.row_number AS "rowNumber",
        bl.display_id AS "leadDisplayId"
      FROM support.lead_usage_rows r
      LEFT JOIN bride_leads bl ON bl.id = r.matched_lead_id
      WHERE r.ticket_id = ${ticketId}::uuid
      ORDER BY r.row_number ASC
    `;
  });

  return NextResponse.json({ data: rows, error: null });
}
