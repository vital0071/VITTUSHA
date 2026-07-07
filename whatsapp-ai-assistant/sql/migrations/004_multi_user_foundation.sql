CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  vittusha_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  source TEXT NOT NULL DEFAULT 'wordpress',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS external_identities (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('wordpress', 'telegram', 'web', 'mobile')),
  external_id TEXT NOT NULL,
  legacy_user_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user_provider
  ON external_identities (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_external_identities_legacy_user_key
  ON external_identities (legacy_user_key)
  WHERE legacy_user_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'pro', 'business')),
  subscription_status TEXT NOT NULL CHECK (subscription_status IN ('pending', 'active', 'paused', 'cancelled', 'expired')),
  payment_provider TEXT,
  changed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (subscription_status);

CREATE TABLE IF NOT EXISTS user_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('telegram', 'email', 'calendar')),
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  provider TEXT,
  external_id TEXT,
  username TEXT,
  connected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, service)
);

CREATE INDEX IF NOT EXISTS idx_user_connections_service_connected
  ON user_connections (service, connected);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wordpress_user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_pending
  ON telegram_link_codes (code_hash, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_id
  ON telegram_link_codes (user_id);
