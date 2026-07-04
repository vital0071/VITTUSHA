import { query } from '../db.js';

export const CORE_MEMORIES = [
  { key: 'preferred_language', value: 'Preferred language: Haitian Creole' },
  { key: 'identity', value: 'User is Vital-Herne Zephy' },
  { key: 'organizations', value: 'User manages STS-Haiti and ProSpace Community' },
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
  const match = String(message).match(/\b(?:remember that|sonje ke|sonje sa|rappele que)\s+(.+)/i);
  if (!match?.[1]) {
    return null;
  }

  const value = match[1].trim();
  if (!value) {
    return null;
  }

  return upsertMemory({
    userPhone,
    key: `user_fact_${Date.now()}`,
    value,
    source: 'user'
  });
}
