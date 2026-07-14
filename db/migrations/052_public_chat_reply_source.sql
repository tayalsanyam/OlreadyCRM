-- Track how each support assistant message was generated (OpenAI, Claude, fallback, handoff).

ALTER TABLE support.public_chat_messages
  ADD COLUMN IF NOT EXISTS reply_source TEXT
  CHECK (
    reply_source IS NULL
    OR reply_source IN ('openai', 'claude', 'fallback', 'handoff')
  );

COMMENT ON COLUMN support.public_chat_messages.reply_source IS
  'Assistant only: openai | claude | fallback (structured template) | handoff (signup)';
