import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { ApiError } from '../routes/errors.js';

const VALID_PLANS = new Set(['starter', 'pro', 'business']);
const VALID_SUBSCRIPTION_STATUSES = new Set(['pending', 'active', 'paused', 'cancelled', 'expired']);
const LINK_CODE_PATTERN = /^[A-Za-z0-9]{24,64}$/;

export function generateBackendUserId() {
  return `usr_${crypto.randomBytes(18).toString('base64url')}`;
}

export function hashTelegramLinkCode(linkCode, secret = config.wordpress.hmacSecret ?? 'vittusha-link-code-dev-secret') {
  return crypto.createHmac('sha256', secret).update(String(linkCode)).digest('hex');
}

export function looksLikeTelegramLinkCode(value) {
  return LINK_CODE_PATTERN.test(String(value ?? '').trim());
}

export async function syncWordPressUser(input) {
  validateRequired(input, ['wordpress_user_id', 'vittusha_user_id']);
  const plan = input.current_plan ?? 'starter';
  const status = input.subscription_status ?? 'pending';
  assertValidPlan(plan);
  assertValidSubscriptionStatus(status);

  return transaction(async (client) => {
    const existing = await client.query(
      'SELECT id FROM users WHERE vittusha_user_id = $1 FOR UPDATE',
      [input.vittusha_user_id]
    );
    const userId = existing.rows[0]?.id ?? generateBackendUserId();

    const userResult = await client.query(
      `
        INSERT INTO users (id, vittusha_user_id, email, first_name, last_name, display_name, source, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (vittusha_user_id)
        DO UPDATE SET email = EXCLUDED.email,
                      first_name = EXCLUDED.first_name,
                      last_name = EXCLUDED.last_name,
                      display_name = EXCLUDED.display_name,
                      source = EXCLUDED.source,
                      metadata = users.metadata || EXCLUDED.metadata,
                      updated_at = NOW()
        RETURNING id, vittusha_user_id
      `,
      [
        userId,
        input.vittusha_user_id,
        input.email ?? null,
        input.first_name ?? null,
        input.last_name ?? null,
        input.display_name ?? null,
        input.source ?? 'wordpress',
        { wordpress_user_id: String(input.wordpress_user_id) }
      ]
    );

    await client.query(
      `
        INSERT INTO external_identities (user_id, provider, external_id, metadata)
        VALUES ($1, 'wordpress', $2, $3)
        ON CONFLICT (provider, external_id)
        DO UPDATE SET user_id = EXCLUDED.user_id,
                      metadata = external_identities.metadata || EXCLUDED.metadata,
                      updated_at = NOW()
      `,
      [userResult.rows[0].id, String(input.wordpress_user_id), { email: input.email ?? null }]
    );

    await upsertSubscriptionWithClient(client, {
      userId: userResult.rows[0].id,
      plan,
      subscriptionStatus: status,
      paymentProvider: input.payment_provider ?? null,
      changedAt: input.changed_at ?? new Date().toISOString()
    });

    await ensureDefaultConnectionsWithClient(client, userResult.rows[0].id);

    return {
      backend_user_id: userResult.rows[0].id,
      vittusha_user_id: userResult.rows[0].vittusha_user_id,
      synced: true
    };
  });
}

export async function syncSubscription(input) {
  validateRequired(input, ['vittusha_user_id', 'plan', 'subscription_status']);
  assertValidPlan(input.plan);
  assertValidSubscriptionStatus(input.subscription_status);

  const user = await getUserByVittushaId(input.vittusha_user_id);
  if (!user) {
    throw new ApiError('user_not_found', 'Vittusha user was not found.', 404);
  }

  await upsertSubscription({
    userId: user.id,
    plan: input.plan,
    subscriptionStatus: input.subscription_status,
    paymentProvider: input.payment_provider ?? null,
    changedAt: input.changed_at ?? new Date().toISOString()
  });

  return {
    vittusha_user_id: input.vittusha_user_id,
    plan: input.plan,
    subscription_status: input.subscription_status
  };
}

export async function registerTelegramLinkCode(input) {
  validateRequired(input, ['wordpress_user_id', 'vittusha_user_id', 'link_code', 'expires_at']);
  if (!looksLikeTelegramLinkCode(input.link_code)) {
    throw new ApiError('invalid_link_code', 'Telegram link code format is invalid.', 422);
  }

  const user = await getUserByVittushaId(input.vittusha_user_id);
  if (!user) {
    throw new ApiError('user_not_found', 'Vittusha user was not found.', 404);
  }

  const expiresAt = new Date(input.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new ApiError('invalid_expiration', 'Telegram link code expiration is invalid.', 422);
  }

  await query(
    `
      INSERT INTO telegram_link_codes (user_id, wordpress_user_id, code_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code_hash)
      DO UPDATE SET user_id = EXCLUDED.user_id,
                    wordpress_user_id = EXCLUDED.wordpress_user_id,
                    expires_at = EXCLUDED.expires_at,
                    used_at = NULL,
                    created_at = NOW()
    `,
    [user.id, String(input.wordpress_user_id), hashTelegramLinkCode(input.link_code), expiresAt]
  );

  return {
    status: 'pending',
    expires_at: expiresAt.toISOString()
  };
}

export async function redeemTelegramLinkCode({ linkCode, chatId, telegramUserId, telegramUsername = null, profileName = null }) {
  if (!looksLikeTelegramLinkCode(linkCode)) {
    return { status: 'not_code' };
  }

  const codeHash = hashTelegramLinkCode(linkCode);

  return transaction(async (client) => {
    const codeResult = await client.query(
      `
        SELECT id, user_id, expires_at, used_at
        FROM telegram_link_codes
        WHERE code_hash = $1
        FOR UPDATE
      `,
      [codeHash]
    );

    const code = codeResult.rows[0];
    if (!code) {
      return { status: 'invalid' };
    }
    if (code.used_at) {
      return { status: 'used' };
    }
    if (new Date(code.expires_at) <= new Date()) {
      return { status: 'expired' };
    }

    await client.query(
      `
        INSERT INTO external_identities (user_id, provider, external_id, legacy_user_key, metadata)
        VALUES ($1, 'telegram', $2, $3, $4)
        ON CONFLICT (provider, external_id)
        DO UPDATE SET user_id = EXCLUDED.user_id,
                      legacy_user_key = EXCLUDED.legacy_user_key,
                      metadata = external_identities.metadata || EXCLUDED.metadata,
                      updated_at = NOW()
      `,
      [
        code.user_id,
        String(telegramUserId ?? chatId),
        String(chatId),
        { chat_id: String(chatId), username: telegramUsername, profile_name: profileName }
      ]
    );

    await client.query(
      `
        INSERT INTO user_connections (user_id, service, connected, provider, external_id, username, connected_at, metadata)
        VALUES ($1, 'telegram', TRUE, 'telegram', $2, $3, NOW(), $4)
        ON CONFLICT (user_id, service)
        DO UPDATE SET connected = TRUE,
                      provider = EXCLUDED.provider,
                      external_id = EXCLUDED.external_id,
                      username = EXCLUDED.username,
                      connected_at = COALESCE(user_connections.connected_at, NOW()),
                      metadata = user_connections.metadata || EXCLUDED.metadata,
                      updated_at = NOW()
      `,
      [code.user_id, String(chatId), telegramUsername, { telegram_user_id: String(telegramUserId ?? chatId), profile_name: profileName }]
    );

    await client.query('UPDATE telegram_link_codes SET used_at = NOW() WHERE id = $1', [code.id]);

    const userResult = await client.query('SELECT vittusha_user_id FROM users WHERE id = $1', [code.user_id]);

    return {
      status: 'linked',
      vittusha_user_id: userResult.rows[0]?.vittusha_user_id ?? null
    };
  });
}

export async function ensureLegacyTelegramUser({ chatId, profileName = null }) {
  if (!chatId) {
    return null;
  }

  const legacyVittushaUserId = `legacy_telegram_${chatId}`;
  return transaction(async (client) => {
    const existingIdentity = await client.query(
      `
        SELECT u.id, u.vittusha_user_id
        FROM external_identities ei
        JOIN users u ON u.id = ei.user_id
        WHERE ei.provider = 'telegram' AND ei.external_id = $1
        LIMIT 1
      `,
      [String(chatId)]
    );

    if (existingIdentity.rows[0]) {
      return existingIdentity.rows[0];
    }

    const userId = generateBackendUserId();
    const userResult = await client.query(
      `
        INSERT INTO users (id, vittusha_user_id, display_name, source, metadata)
        VALUES ($1, $2, $3, 'telegram', $4)
        ON CONFLICT (vittusha_user_id)
        DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, users.display_name),
                      metadata = users.metadata || EXCLUDED.metadata,
                      updated_at = NOW()
        RETURNING id, vittusha_user_id
      `,
      [userId, legacyVittushaUserId, profileName, { legacy: true, legacy_user_key: String(chatId) }]
    );

    await client.query(
      `
        INSERT INTO external_identities (user_id, provider, external_id, legacy_user_key, metadata)
        VALUES ($1, 'telegram', $2, $2, $3)
        ON CONFLICT (provider, external_id)
        DO NOTHING
      `,
      [userResult.rows[0].id, String(chatId), { profile_name: profileName, legacy: true }]
    );

    await client.query(
      `
        INSERT INTO user_connections (user_id, service, connected, provider, external_id, connected_at, metadata)
        VALUES ($1, 'telegram', TRUE, 'telegram', $2, NOW(), $3)
        ON CONFLICT (user_id, service)
        DO UPDATE SET connected = TRUE,
                      updated_at = NOW()
      `,
      [userResult.rows[0].id, String(chatId), { legacy: true }]
    );

    return userResult.rows[0];
  });
}

export async function getConnections(vittushaUserId) {
  const user = await getUserByVittushaId(vittushaUserId);
  if (!user) {
    throw new ApiError('user_not_found', 'Vittusha user was not found.', 404);
  }

  await ensureDefaultConnections(user.id);

  const result = await query(
    `
      SELECT service, connected, provider, external_id, username, connected_at
      FROM user_connections
      WHERE user_id = $1
    `,
    [user.id]
  );

  const byService = Object.fromEntries(result.rows.map((row) => [row.service, row]));
  return {
    telegram: formatConnection(byService.telegram, 'telegram'),
    email: formatConnection(byService.email, 'email'),
    calendar: formatConnection(byService.calendar, 'calendar')
  };
}

async function getUserByVittushaId(vittushaUserId) {
  const result = await query('SELECT id, vittusha_user_id FROM users WHERE vittusha_user_id = $1', [vittushaUserId]);
  return result.rows[0] ?? null;
}

async function upsertSubscription(input) {
  await query(
    `
      INSERT INTO subscriptions (user_id, plan, subscription_status, payment_provider, changed_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id)
      DO UPDATE SET plan = EXCLUDED.plan,
                    subscription_status = EXCLUDED.subscription_status,
                    payment_provider = EXCLUDED.payment_provider,
                    changed_at = EXCLUDED.changed_at,
                    updated_at = NOW()
    `,
    [input.userId, input.plan, input.subscriptionStatus, input.paymentProvider, input.changedAt]
  );
}

async function upsertSubscriptionWithClient(client, input) {
  await client.query(
    `
      INSERT INTO subscriptions (user_id, plan, subscription_status, payment_provider, changed_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id)
      DO UPDATE SET plan = EXCLUDED.plan,
                    subscription_status = EXCLUDED.subscription_status,
                    payment_provider = EXCLUDED.payment_provider,
                    changed_at = EXCLUDED.changed_at,
                    updated_at = NOW()
    `,
    [input.userId, input.plan, input.subscriptionStatus, input.paymentProvider, input.changedAt]
  );
}

async function ensureDefaultConnections(userId) {
  await transaction((client) => ensureDefaultConnectionsWithClient(client, userId));
}

async function ensureDefaultConnectionsWithClient(client, userId) {
  for (const service of ['telegram', 'email', 'calendar']) {
    await client.query(
      `
        INSERT INTO user_connections (user_id, service, connected)
        VALUES ($1, $2, FALSE)
        ON CONFLICT (user_id, service) DO NOTHING
      `,
      [userId, service]
    );
  }
}

function formatConnection(row, service) {
  const connected = Boolean(row?.connected);
  if (service === 'telegram') {
    return {
      connected,
      telegram_chat_id: connected ? row.external_id : null,
      telegram_username: connected ? row.username : null,
      connected_at: row?.connected_at ? new Date(row.connected_at).toISOString() : null
    };
  }

  return {
    connected,
    provider: connected ? row.provider : null,
    connected_at: row?.connected_at ? new Date(row.connected_at).toISOString() : null
  };
}

function validateRequired(input, fields) {
  for (const field of fields) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      throw new ApiError('missing_field', `Missing required field: ${field}`, 422, { field });
    }
  }
}

function assertValidPlan(plan) {
  if (!VALID_PLANS.has(plan)) {
    throw new ApiError('invalid_plan', 'Plan is invalid.', 422, { valid: [...VALID_PLANS] });
  }
}

function assertValidSubscriptionStatus(status) {
  if (!VALID_SUBSCRIPTION_STATUSES.has(status)) {
    throw new ApiError('invalid_subscription_status', 'Subscription status is invalid.', 422, { valid: [...VALID_SUBSCRIPTION_STATUSES] });
  }
}

export async function getTelegramUserContext({ chatId, telegramUserId = null }) {
  const externalIds = [String(telegramUserId ?? ''), String(chatId ?? '')].filter(Boolean);
  const result = await query(
    `
      SELECT u.id, u.vittusha_user_id, u.metadata, ei.legacy_user_key
      FROM external_identities ei
      JOIN users u ON u.id = ei.user_id
      WHERE ei.provider = 'telegram' AND ei.external_id = ANY($1::text[])
      ORDER BY ei.updated_at DESC
      LIMIT 1
    `,
    [externalIds]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      authorized: false,
      backendUserId: null,
      vittushaUserId: null,
      userKey: null,
      legacy: false
    };
  }

  const legacy = Boolean(row.metadata?.legacy);
  return {
    authorized: true,
    backendUserId: row.id,
    vittushaUserId: row.vittusha_user_id,
    userKey: legacy ? String(row.legacy_user_key ?? chatId) : row.vittusha_user_id,
    legacy
  };
}
