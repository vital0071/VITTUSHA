CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  from_phone TEXT NOT NULL,
  profile_name TEXT,
  user_message TEXT NOT NULL,
  assistant_reply TEXT,
  detected_language TEXT NOT NULL DEFAULT 'ht',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  agent_response JSONB,
  tool_needed TEXT,
  task_id BIGINT,
  raw_payload JSONB,
  whatsapp_response JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_from_phone_created_at
  ON conversations (from_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_detected_language
  ON conversations (detected_language);

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

CREATE TABLE IF NOT EXISTS suggestions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'dismissed', 'completed')),
  related_task_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_user_status_priority
  ON suggestions (user_id, status, priority);

CREATE INDEX IF NOT EXISTS idx_suggestions_related_task_id
  ON suggestions (related_task_id);
