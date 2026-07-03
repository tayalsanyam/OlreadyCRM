/**
 * Static SQL snippets for bookings filters.
 * Use with sql.unsafe() inside a parent query — do not wrap in sql`…` at module scope
 * (cross-module fragments break postgres.js parameter binding under Next.js bundling).
 */

/** Feedback RM captured connected Olready MUA on a formal booking's lead. */
export const FORMAL_SELF_BOOKING_EXISTS = `EXISTS (
  SELECT 1 FROM lead_feedback lf_sb
  WHERE lf_sb.lead_id = b.lead_id
    AND lf_sb.olready_mua_id = b.mua_id
    AND lf_sb.connection_status = 'connected'
    AND lf_sb.mua_type = 'olready'
    AND lf_sb.submitted_by IS NOT NULL
    AND (
      lf_sb.event_id IS NULL
      OR lf_sb.event_id = b.event_id
    )
)`;

/** Feedback row counts as MUA booking (alias must be lf). */
export const FEEDBACK_BOOKING_LEAD_PREDICATE = `(
  lf.olready_mua_id IS NOT NULL
  AND lf.connection_status = 'connected'
  AND lf.mua_type = 'olready'
  AND EXISTS (
    SELECT 1 FROM mua_pushes mp
    WHERE mp.lead_id = lf.lead_id AND mp.mua_id = lf.olready_mua_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM bookings b_fb
    WHERE b_fb.lead_id = lf.lead_id
      AND b_fb.mua_id = lf.olready_mua_id
      AND NOT COALESCE(b_fb.cancelled, false)
      AND (
        lf.event_id IS NULL
        OR b_fb.event_id = lf.event_id
      )
  )
)`;
