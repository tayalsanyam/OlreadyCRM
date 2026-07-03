import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** Bride referrals + MUA prospects captured on feedback calls by this user. */
export async function GET(request: Request) {
  const auth = await requireRoles(["feedbackRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  const staffId = auth.session.userId;

  const brideReferrals = await sql`
    SELECT
      fr.id,
      fr.referral_name AS "referralName",
      fr.referral_phone AS "referralPhone",
      fr.capture_type AS "captureType",
      fr.notes,
      fr.status,
      fr.created_at AS "createdAt",
      bl.bride_name AS "sourceBrideName",
      bl.display_id AS "sourceDisplayId",
      'bride' AS kind
    FROM feedback_referrals fr
    JOIN bride_leads bl ON bl.id = fr.source_lead_id
    WHERE fr.captured_by = ${staffId}::uuid
      AND fr.status = ${status}
    ORDER BY fr.created_at DESC
  `;

  const muaProspects = await sql`
    SELECT
      mp.id,
      mp.non_olready_mua_name AS "muaName",
      mp.phone,
      mp.insta_id AS "instaId",
      mp.city,
      mp.status,
      mp.created_at AS "createdAt",
      bl.bride_name AS "sourceBrideName",
      bl.display_id AS "sourceDisplayId",
      'mua' AS kind
    FROM mua_prospects mp
    JOIN lead_feedback lf ON lf.id = mp.feedback_id
    JOIN bride_leads bl ON bl.id = mp.lead_id
    WHERE lf.submitted_by = ${staffId}::uuid
      AND mp.status != 'closed'
    ORDER BY mp.created_at DESC
  `;

  return NextResponse.json({
    data: {
      brideReferrals,
      muaProspects,
    },
    error: null,
  });
}
