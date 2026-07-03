import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import { completeUploaderFeedbackReferralTask } from "@/lib/uploader-referral-task";

export const dynamic = "force-dynamic";

async function fetchBrideReferrals(status: string | null) {
  return status
    ? sql`
        SELECT
          fr.id,
          'bride'::text AS kind,
          fr.referral_name AS "referralName",
          fr.referral_phone AS "referralPhone",
          fr.capture_type AS "captureType",
          fr.notes,
          fr.status,
          fr.created_at AS "createdAt",
          bl.bride_name AS "sourceBrideName",
          bl.display_id AS "sourceDisplayId",
          s.name AS "capturedByName",
          NULL::text AS "instaId",
          NULL::text AS city
        FROM feedback_referrals fr
        JOIN bride_leads bl ON bl.id = fr.source_lead_id
        JOIN staff s ON s.id = fr.captured_by
        WHERE fr.status = ${status}
        ORDER BY fr.created_at DESC
      `
    : sql`
        SELECT
          fr.id,
          'bride'::text AS kind,
          fr.referral_name AS "referralName",
          fr.referral_phone AS "referralPhone",
          fr.capture_type AS "captureType",
          fr.notes,
          fr.status,
          fr.created_at AS "createdAt",
          bl.bride_name AS "sourceBrideName",
          bl.display_id AS "sourceDisplayId",
          s.name AS "capturedByName",
          NULL::text AS "instaId",
          NULL::text AS city
        FROM feedback_referrals fr
        JOIN bride_leads bl ON bl.id = fr.source_lead_id
        JOIN staff s ON s.id = fr.captured_by
        ORDER BY fr.created_at DESC
      `;
}

async function fetchMuaProspects(status: string | null) {
  if (status && status !== "pending") return [];

  return status === "pending"
    ? sql`
        SELECT
          mp.id,
          'mua'::text AS kind,
          mp.non_olready_mua_name AS "referralName",
          mp.phone AS "referralPhone",
          NULL::text AS "captureType",
          NULL::text AS notes,
          mp.status,
          mp.created_at AS "createdAt",
          bl.bride_name AS "sourceBrideName",
          bl.display_id AS "sourceDisplayId",
          s.name AS "capturedByName",
          mp.insta_id AS "instaId",
          mp.city
        FROM mua_prospects mp
        JOIN lead_feedback lf ON lf.id = mp.feedback_id
        JOIN bride_leads bl ON bl.id = mp.lead_id
        LEFT JOIN staff s ON s.id = lf.submitted_by
        WHERE mp.status IN ('pending', 'collected')
        ORDER BY mp.created_at DESC
      `
    : sql`
        SELECT
          mp.id,
          'mua'::text AS kind,
          mp.non_olready_mua_name AS "referralName",
          mp.phone AS "referralPhone",
          NULL::text AS "captureType",
          NULL::text AS notes,
          mp.status,
          mp.created_at AS "createdAt",
          bl.bride_name AS "sourceBrideName",
          bl.display_id AS "sourceDisplayId",
          s.name AS "capturedByName",
          mp.insta_id AS "instaId",
          mp.city
        FROM mua_prospects mp
        JOIN lead_feedback lf ON lf.id = mp.feedback_id
        JOIN bride_leads bl ON bl.id = mp.lead_id
        LEFT JOIN staff s ON s.id = lf.submitted_by
        ORDER BY mp.created_at DESC
      `;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const status = new URL(request.url).searchParams.get("status");
  const [brideReferrals, muaProspects] = await Promise.all([
    fetchBrideReferrals(status),
    fetchMuaProspects(status),
  ]);

  const flatRows = [...brideReferrals, ...muaProspects].sort(
    (a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime(),
  );

  if (wantsCsv(request)) {
    return exportListCsv(
      "feedback-referrals",
      [
        { header: "Type", value: (r) => (r.kind === "mua" ? "MUA" : "Bride") },
        { header: "Name", value: (r) => r.referralName ?? "" },
        { header: "Phone", value: (r) => r.referralPhone ?? "" },
        { header: "City", value: (r) => r.city ?? "" },
        { header: "Insta", value: (r) => r.instaId ?? "" },
        { header: "Source lead", value: (r) => r.sourceDisplayId ?? "" },
        { header: "Source bride", value: (r) => r.sourceBrideName ?? "" },
        { header: "Captured by", value: (r) => r.capturedByName ?? "" },
        { header: "Status", value: (r) => r.status ?? "" },
        { header: "Created", value: (r) => r.createdAt ?? "" },
      ],
      flatRows as Record<string, unknown>[],
    );
  }

  return NextResponse.json({
    data: { brideReferrals, muaProspects },
    error: null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner", "leadUploader"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    id?: string;
    status?: string;
    convertedLeadId?: string | null;
    notes?: string | null;
  };

  if (!body.id || !body.status) {
    return NextResponse.json(
      { data: null, error: "id and status required" },
      { status: 400 },
    );
  }

  const row = await withTransaction(async (tx) => {
    const [updated] = await tx`
      UPDATE feedback_referrals SET
        status = ${body.status},
        converted_lead_id = ${body.convertedLeadId ?? null}::uuid,
        notes = COALESCE(${body.notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${body.id!}::uuid
      RETURNING *
    `;

    if (
      updated &&
      (body.status === "picked_up" ||
        body.status === "converted" ||
        body.status === "dismissed")
    ) {
      await completeUploaderFeedbackReferralTask(
        tx,
        body.id!,
        auth.session.userId,
      );
    }

    return updated ?? null;
  });

  return NextResponse.json({ data: row, error: null });
}
