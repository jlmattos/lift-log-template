-- Persisted chat conversations with Claude. Single-user app, so no user_id col.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,                              -- auto-derived from first user message
  model       text NOT NULL DEFAULT 'claude-sonnet-4-5',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL,                 -- 'user' | 'assistant'
  content         jsonb NOT NULL,                -- Anthropic ContentBlock[] format
  tool_calls      jsonb,                         -- optional summary of tool usage
  input_tokens    int,
  output_tokens   int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
  ON chat_conversations(updated_at DESC);
