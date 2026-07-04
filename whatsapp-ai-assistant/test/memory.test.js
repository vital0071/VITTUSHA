import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMemoriesWithQuery } from '../src/memory/memory-store.js';

test('loads memories for a user phone number', async () => {
  const rows = [
    { id: 1, key: 'preferred_language', value: 'Preferred language: Haitian Creole', source: 'system' }
  ];

  const memories = await loadMemoriesWithQuery(async (sql, params) => {
    assert.match(sql, /FROM memories/);
    assert.deepEqual(params, ['50912345678']);
    return { rows };
  }, { userPhone: '50912345678' });

  assert.deepEqual(memories, rows);
});
