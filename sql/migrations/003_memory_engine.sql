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

ALTER TABLE memories ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'FACT';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance NUMERIC(3,2) NOT NULL DEFAULT 0.50;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

UPDATE memories
SET user_id = COALESCE(user_id, user_phone),
    title = COALESCE(title, key, 'Memory'),
    content = COALESCE(content, value, '')
WHERE user_id IS NULL
   OR title IS NULL
   OR content IS NULL;

INSERT INTO users (id, external_id)
SELECT DISTINCT user_id, user_id
FROM memories
WHERE user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE memories ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE memories ALTER COLUMN title SET NOT NULL;
ALTER TABLE memories ALTER COLUMN content SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memories_user_id_fkey'
  ) THEN
    ALTER TABLE memories
      ADD CONSTRAINT memories_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memories_type_check'
  ) THEN
    ALTER TABLE memories
      ADD CONSTRAINT memories_type_check
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
      ));
  END IF;
END $$;

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
