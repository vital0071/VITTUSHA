ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS agent_response JSONB,
  ADD COLUMN IF NOT EXISTS tool_needed TEXT,
  ADD COLUMN IF NOT EXISTS task_id BIGINT;

CREATE TABLE IF NOT EXISTS memories (
  id BIGSERIAL PRIMARY KEY,
  user_phone TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_phone, key)
);

CREATE INDEX IF NOT EXISTS idx_memories_user_phone
  ON memories (user_phone);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  user_phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'running', 'completed', 'cancelled')),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_phone_created_at
  ON tasks (user_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks (status);
