-- Case-journey ticket stages (decoupled from email draft / approval workflow).

CREATE TYPE support.ticket_status_new AS ENUM (
  'received',
  'investigating',
  'awaiting_info',
  'initial_reply_sent',
  'in_discussion',
  'final_offer',
  'resolution_proposed',
  'closed'
);

ALTER TABLE support.tickets
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE support.tickets
  ALTER COLUMN status TYPE support.ticket_status_new
  USING (
    CASE status::text
      WHEN 'open' THEN 'received'
      WHEN 'in_investigation' THEN 'investigating'
      WHEN 'pending_compilation' THEN 'investigating'
      WHEN 'pending_approval' THEN 'investigating'
      WHEN 'revision_requested' THEN 'investigating'
      WHEN 'approved' THEN 'initial_reply_sent'
      WHEN 'closed' THEN 'closed'
      ELSE 'received'
    END
  )::support.ticket_status_new;

ALTER TABLE support.tickets
  ALTER COLUMN status SET DEFAULT 'received';

ALTER TABLE support.ticket_status_history
  ALTER COLUMN from_status TYPE support.ticket_status_new
  USING (
    CASE
      WHEN from_status IS NULL THEN NULL
      ELSE (
        CASE from_status::text
          WHEN 'open' THEN 'received'
          WHEN 'in_investigation' THEN 'investigating'
          WHEN 'pending_compilation' THEN 'investigating'
          WHEN 'pending_approval' THEN 'investigating'
          WHEN 'revision_requested' THEN 'investigating'
          WHEN 'approved' THEN 'initial_reply_sent'
          WHEN 'closed' THEN 'closed'
          ELSE 'received'
        END
      )::support.ticket_status_new
    END
  );

ALTER TABLE support.ticket_status_history
  ALTER COLUMN to_status TYPE support.ticket_status_new
  USING (
    CASE to_status::text
      WHEN 'open' THEN 'received'
      WHEN 'in_investigation' THEN 'investigating'
      WHEN 'pending_compilation' THEN 'investigating'
      WHEN 'pending_approval' THEN 'investigating'
      WHEN 'revision_requested' THEN 'investigating'
      WHEN 'approved' THEN 'initial_reply_sent'
      WHEN 'closed' THEN 'closed'
      ELSE 'received'
    END
  )::support.ticket_status_new;

DROP TYPE support.ticket_status;

ALTER TYPE support.ticket_status_new RENAME TO ticket_status;
