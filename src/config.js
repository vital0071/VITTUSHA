import 'dotenv/config';

const required = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALLOWED_CHAT_ID',
  'OPENAI_API_KEY'
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
  telegram: {
    botToken: readEnv('TELEGRAM_BOT_TOKEN'),
    allowedChatId: readEnv('TELEGRAM_ALLOWED_CHAT_ID')
  },
  openai: {
    apiKey: readEnv('OPENAI_API_KEY'),
    model: readEnv('OPENAI_MODEL', 'gpt-4.1-mini'),
    maxOutputTokens: Number(readEnv('OPENAI_MAX_OUTPUT_TOKENS', '700'))
  },
  debug: {
    routesEnabled: readEnv('DEBUG_ROUTES_ENABLED', 'false').toLowerCase() === 'true'
  },
  databaseUrl: readEnv('DATABASE_URL'),
  pgssl: readEnv('PGSSL', 'false').toLowerCase() === 'true'
};

export function normalizePhoneNumber(value = '') {
  return String(value).replace(/[^\d]/g, '');
}

export function isApprovedPhoneNumber(value) {
  return false;
}
