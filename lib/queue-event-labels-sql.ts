/** Ceremony labels column — embed via sql.unsafe(QUEUE_EVENT_LABELS_COLUMN) inside a parent SELECT only. */
export const QUEUE_EVENT_LABELS_COLUMN = `
  (
    SELECT string_agg(
      le.ceremony_type
        || CASE
          WHEN le.budget_amount IS NOT NULL AND le.budget_amount > 0
          THEN ' · Rs. ' || trim(to_char(le.budget_amount, 'FM999,999,999'))
          ELSE ''
        END,
      ', ' ORDER BY le.event_date NULLS LAST, le.ceremony_type
    )
    FROM lead_events le
    WHERE le.lead_id = bl.id AND le.status != 'not_needed'
  ) AS event_labels
`;
