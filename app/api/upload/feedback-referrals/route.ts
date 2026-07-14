import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const status = new URL(request.url).searchParams.get("status") ?? "latest";

  const rows =
    status === "latest"
      ? await sql`
          SELECT
            fr.id,
            fr.referral_name AS "referralName",
            fr.referral_phone AS "referralPhone",
            fr.capture_type AS "captureType",
            fr.notes,
            fr.status,
            fr.converted_lead_id AS "convertedLeadId",
            fr.created_at AS "createdAt",
            bl.bride_name AS "sourceBrideName",
            bl.display_id AS "sourceDisplayId",
            s.name AS "capturedByName"
          FROM feedback_referrals fr
          JOIN bride_leads bl ON bl.id = fr.source_lead_id
          JOIN staff s ON s.id = fr.captured_by
          WHERE fr.referral_phone IS NOT NULL
            AND fr.status IN ('pending', 'picked_up')
          ORDER BY fr.created_at DESC
        `
      : status === "all"
        ? await sql`
            SELECT
              fr.id,
              fr.referral_name AS "referralName",
              fr.referral_phone AS "referralPhone",
              fr.capture_type AS "captureType",
              fr.notes,
              fr.status,
              fr.converted_lead_id AS "convertedLeadId",
              fr.created_at AS "createdAt",
              bl.bride_name AS "sourceBrideName",
              bl.display_id AS "sourceDisplayId",
              s.name AS "capturedByName"
            FROM feedback_referrals fr
            JOIN bride_leads bl ON bl.id = fr.source_lead_id
            JOIN staff s ON s.id = fr.captured_by
            WHERE fr.referral_phone IS NOT NULL
            ORDER BY fr.created_at DESC
          `
        : await sql`
            SELECT
              fr.id,
              fr.referral_name AS "referralName",
              fr.referral_phone AS "referralPhone",
              fr.capture_type AS "captureType",
              fr.notes,
              fr.status,
              fr.converted_lead_id AS "convertedLeadId",
              fr.created_at AS "createdAt",
              bl.bride_name AS "sourceBrideName",
              bl.display_id AS "sourceDisplayId",
              s.name AS "capturedByName"
            FROM feedback_referrals fr
            JOIN bride_leads bl ON bl.id = fr.source_lead_id
            JOIN staff s ON s.id = fr.captured_by
            WHERE fr.referral_phone IS NOT NULL
              AND fr.status = ${status}
            ORDER BY fr.created_at DESC
          `;

  return NextResponse.json({ data: rows, error: null });
}
