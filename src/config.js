import 'dotenv/config';

const required = [
  'META_VERIFY_TOKEN',
  'META_ACCESS_TOKEN',
  'META_PHONE_NUMBER_ID',
  'APPROVED_PHONE_NUMBER',
  'OPENAI_API_KEY',
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
    botToken: readEnv('TELEGRAM_BOT_TOKEN')
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
  return normalizePhoneNumber(value) === normalizePhoneNumber(config.approvedPhoneNumber);
}
