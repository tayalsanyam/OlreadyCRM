import { sql } from "@/db/index";
import type { FeedbackServiceSentiment } from "@/lib/types";

export type MuaFeedbackRow = {
  id: string;
  leadId: string;
  displayId: string;
  brideName: string;
  muaRating: number | null;
  olreadyRating: number | null;
  serviceSentiment: FeedbackServiceSentiment | null;
  muaServiceNote: string | null;
  olreadyServiceNote: string | null;
  connectionStatus: string;
  submittedByName: string | null;
  createdAt: string;
};

export type MuaFeedbackSummary = {
  avgMuaRating: number | null;
  avgOlreadyRating: number | null;
  feedbackCount: number;
  ratedCount: number;
};

export async function fetchMuaFeedback(muaId: string): Promise<{
  summary: MuaFeedbackSummary;
  rows: MuaFeedbackRow[];
}> {
  const [summaryRow] = await sql<
    {
      avgMuaRating: number | null;
      avgOlreadyRating: number | null;
      feedbackCount: number;
      ratedCount: number;
    }[]
  >`
    SELECT
      ROUND(AVG(lf.mua_rating) FILTER (WHERE lf.mua_rating IS NOT NULL), 1)::float AS "avgMuaRating",
      ROUND(AVG(lf.olready_rating) FILTER (WHERE lf.olready_rating IS NOT NULL), 1)::float AS "avgOlreadyRating",
      COUNT(*)::int AS "feedbackCount",
      (COUNT(*) FILTER (WHERE lf.mua_rating IS NOT NULL))::int AS "ratedCount"
    FROM lead_feedback lf
    WHERE lf.olready_mua_id = ${muaId}::uuid
      AND lf.connection_status = 'connected'
      AND lf.mua_type = 'olready'
  `;

  const rows = await sql<MuaFeedbackRow[]>`
    SELECT
      lf.id,
      lf.lead_id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      lf.mua_rating AS "muaRating",
      lf.olready_rating AS "olreadyRating",
      lf.service_sentiment AS "serviceSentiment",
      lf.mua_service_note AS "muaServiceNote",
      lf.olready_service_note AS "olreadyServiceNote",
      lf.connection_status AS "connectionStatus",
      s.name AS "submittedByName",
      lf.created_at AS "createdAt"
    FROM lead_feedback lf
    JOIN bride_leads bl ON bl.id = lf.lead_id
    LEFT JOIN staff s ON s.id = lf.submitted_by
    WHERE lf.olready_mua_id = ${muaId}::uuid
      AND lf.connection_status = 'connected'
      AND lf.mua_type = 'olready'
    ORDER BY lf.created_at DESC
    LIMIT 100
  `;

  return {
    summary: {
      avgMuaRating: summaryRow?.avgMuaRating ?? null,
      avgOlreadyRating: summaryRow?.avgOlreadyRating ?? null,
      feedbackCount: summaryRow?.feedbackCount ?? 0,
      ratedCount: summaryRow?.ratedCount ?? 0,
    },
    rows,
  };
}
