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

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  external_id TEXT UNIQUE,
  display_name TEXT,
  language TEXT,
  timezone TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memories (
  id BIGSERIAL PRIMARY KEY,
  user_phone TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_id TEXT,
  type TEXT NOT NULL DEFAULT 'FACT'
    CHECK (type IN (
      'PERSON',
      'PROJECT',
      'BUSINESS',
      'PREFERENCE',
      'OBJECTIVE',
      'FACT',
      'TASK',
      'LOCATION',
      'LANGUAGE',
      'RELATION',
      'CONTACT',
      'CUSTOM'
    )),
  title TEXT,
  content TEXT,
  importance NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  source TEXT NOT NULL DEFAULT 'agent',
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_phone, key)
);

CREATE INDEX IF NOT EXISTS idx_memories_user_phone
  ON memories (user_phone);

CREATE INDEX IF NOT EXISTS idx_memories_user_type_updated_at
  ON memories (user_id, type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_user_archived_importance
  ON memories (user_id, is_archived, importance DESC, confidence DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_conversation_created
  ON conversation_messages (user_id, conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id BIGSERIAL PRIMARY KEY,
  memory_id BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  provider TEXT,
  model TEXT,
  embedding JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_tags (
  id BIGSERIAL PRIMARY KEY,
  memory_id BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (memory_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_memory_tags_tag
  ON memory_tags (tag);

CREATE TABLE IF NOT EXISTS memory_links (
  id BIGSERIAL PRIMARY KEY,
  source_memory_id BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  target_memory_id BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'related',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_memory_id, target_memory_id, relation_type)
);

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
