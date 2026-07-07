import 'dotenv/config';

const required = [
  'OPENAI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALLOWED_CHAT_ID',
  'DATABASE_URL'
];

function readEnv(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

export function assertRequiredEnv() {
  const missing = required.filter((name) => !readEnv(name));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export const config = {
  nodeEnv: readEnv('NODE_ENV', 'development'),
  port: Number(readEnv('PORT', '3000')),
  meta: {
    verifyToken: readEnv('META_VERIFY_TOKEN'),
    accessToken: readEnv('META_ACCESS_TOKEN'),
    phoneNumberId: readEnv('META_PHONE_NUMBER_ID'),
    graphApiVersion: readEnv('META_GRAPH_API_VERSION', 'v21.0')
  },
  telegram: {
    botToken: readEnv('TELEGRAM_BOT_TOKEN'),
    allowedChatId: readEnv('TELEGRAM_ALLOWED_CHAT_ID')
  },
  wordpress: {
    baseUrl: readEnv('WORDPRESS_BASE_URL', 'https://ai.stshaiti.com'),
    apiKeyId: readEnv('WORDPRESS_API_KEY_ID'),
    hmacSecret: readEnv('WORDPRESS_HMAC_SECRET'),
    webhookSecret: readEnv('WORDPRESS_WEBHOOK_SECRET'),
    allowedOrigin: readEnv('ALLOWED_WORDPRESS_ORIGIN', 'https://ai.stshaiti.com'),
    hmacMaxSkewSeconds: Number(readEnv('WORDPRESS_HMAC_MAX_SKEW_SECONDS', '300'))
  },
  linkCodes: {
    ttlSeconds: Number(readEnv('LINK_CODE_TTL_SECONDS', '1800'))
  },
  approvedPhoneNumber: readEnv('APPROVED_PHONE_NUMBER'),
  openai: {
    apiKey: readEnv('OPENAI_API_KEY'),
    model: readEnv('OPENAI_MODEL', 'gpt-4.1-mini'),
    maxOutputTokens: Number(readEnv('OPENAI_MAX_OUTPUT_TOKENS', '700'))
  },
  proactive: {
    enableCheckIn: readEnv('ENABLE_PROACTIVE_CHECKIN', 'false').toLowerCase() === 'true',
    checkInTime: readEnv('PROACTIVE_CHECKIN_TIME', '08:00')
  },
  databaseUrl: readEnv('DATABASE_URL'),
  pgssl: readEnv('PGSSL', 'false').toLowerCase() === 'true'
};

export function normalizePhoneNumber(value = '') {
  return String(value).replace(/[^\d]/g, '');
}

export function isApprovedPhoneNumber(value) {
  return normalizePhoneNumber(value) === normalizePhoneNumber(config.approvedPhoneNumber);
}

export function isApprovedTelegramChat(value) {
  return String(value) === String(config.telegram.allowedChatId);
}
