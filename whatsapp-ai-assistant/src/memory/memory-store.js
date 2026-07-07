import { query } from '../db.js';
import { isAiIdentityConflict } from '../identity/core-identity.js';

export const CORE_MEMORIES = [
  { key: 'approval_rule', value: 'Never send external actions without approval' }
];

export async function ensureCoreMemories({ userPhone }) {
  for (const memory of CORE_MEMORIES) {
    await upsertMemory({
      userPhone,
      key: memory.key,
      value: memory.value,
      source: 'system'
    });
  }
}

export async function loadMemories({ userPhone }) {
  return loadMemoriesWithQuery(query, { userPhone });
}

export async function loadMemoriesWithQuery(queryFn, { userPhone }) {
  const result = await queryFn(
    `
      SELECT id, key, value, source, created_at, updated_at
      FROM memories
      WHERE user_phone = $1
      ORDER BY updated_at DESC, created_at DESC
    `,
    [userPhone]
  );

  return result.rows;
}

export async function upsertMemory({ userPhone, key, value, source = 'agent' }) {
  const result = await query(
    `
      INSERT INTO memories (user_phone, key, value, source)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_phone, key)
      DO UPDATE SET value = EXCLUDED.value,
                    source = EXCLUDED.source,
                    updated_at = NOW()
      RETURNING id, key, value, source, created_at, updated_at
    `,
    [userPhone, key, value, source]
  );

  return result.rows[0];
}

export async function storeMemoryFromMessage({ userPhone, message }) {
  return storeMemoryFromMessageWithQuery(query, { userPhone, message });
}

export async function storeMemoryFromMessageWithQuery(queryFn, { userPhone, message }) {
  const extraction = extractDurableMemory(message);
  if (!extraction.memory) {
    return null;
  }

  const result = await queryFn(
    `
      INSERT INTO memories (user_phone, key, value, source)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_phone, key)
      DO UPDATE SET value = EXCLUDED.value,
                    source = EXCLUDED.source,
                    updated_at = NOW()
      RETURNING id, key, value, source, created_at, updated_at
    `,
    [userPhone, extraction.memory.key, extraction.memory.value, extraction.memory.source]
  );

  return result.rows[0];
}

export function extractDurableMemory(message = '') {
  const text = String(message).trim();
  const normalized = normalize(text);

  if (!text || isTemporaryMessage(normalized)) {
    return reject('temporary_information');
  }

  if (isAiIdentityConflict(text)) {
    return reject('ai_identity_conflict');
  }

  const explicit = text.match(/\b(?:remember that|sonje ke|sonje sa|rappele que|rappelle que)\s+(.+)/iu);
  if (explicit?.[1]) {
    return durable(`explicit_${stableKey(explicit[1])}`, explicit[1].trim(), 'user');
  }

  const nameMatch = text.match(/^(?:mwen rele|non mwen se|my name is|je m'appelle|je suis)\s+(.+)$/iu);
  if (nameMatch?.[1]) {
    return durable('user_name', `User name: ${cleanValue(nameMatch[1])}`, 'agent');
  }

  const preferenceMatch = text.match(/\b(?:mwen prefere|mwen renmen|i prefer|i like|je prefere|j'aime)\s+(.+)$/iu);
  if (preferenceMatch?.[1]) {
    return durable(`preference_${stableKey(preferenceMatch[1])}`, `User preference: ${cleanValue(preferenceMatch[1])}`, 'agent');
  }

  const projectMatch = text.match(/\b(?:m ap travay sou pwoj[èe]|mwen ap travay sou pwoj[èe]|i am working on project|my project is|je travaille sur le projet|mon projet est)\s+(.+)$/iu);
  if (projectMatch?.[1]) {
    return durable(`project_${stableKey(projectMatch[1])}`, `Project: ${cleanValue(projectMatch[1])}`, 'agent');
  }

  const organizationMatch = text.match(/\b(?:mwen jere|m ap jere|i manage|je gere)\s+(.+)$/iu);
  if (organizationMatch?.[1]) {
    return durable(`responsibility_${stableKey(organizationMatch[1])}`, `User responsibility: ${cleanValue(organizationMatch[1])}`, 'agent');
  }

  return reject('not_durable');
}

function durable(key, value, source) {
  const cleaned = cleanValue(value);
  if (!cleaned) {
    return reject('invalid_structure');
  }

  return {
    memory: {
      key,
      value: cleaned,
      source
    },
    rejected: false,
    reason: 'durable_fact'
  };
}

function reject(reason) {
  return {
    memory: null,
    rejected: true,
    reason
  };
}

function isTemporaryMessage(normalized) {
  return ['ping', 'bonjou', 'bonjour', 'hello', 'hi', 'salut', 'ok', 'wi', 'yes'].includes(normalized);
}

function stableKey(value = '') {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'fact';
}

function cleanValue(value = '') {
  return String(value).replace(/[?.!]+$/g, '').trim();
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
