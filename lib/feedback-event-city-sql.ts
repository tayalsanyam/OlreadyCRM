/** Latest past ceremony location, else lead summary, else bride city — expects `lf` alias. */
export const FEEDBACK_EVENT_CITY_SQL = `
  COALESCE(
    (
      SELECT le.event_location
      FROM lead_events le
      WHERE le.lead_id = lf.id
        AND le.status != 'not_needed'
        AND le.event_date < CURRENT_DATE
        AND NULLIF(TRIM(le.event_location), '') IS NOT NULL
      ORDER BY le.event_date DESC
      LIMIT 1
    ),
    NULLIF(TRIM(lf.event_location), ''),
    NULLIF(TRIM(lf.city), '')
  )
`;
