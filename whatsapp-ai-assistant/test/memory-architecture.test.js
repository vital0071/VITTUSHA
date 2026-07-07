import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDurableMemory,
  loadMemoriesWithQuery,
  storeMemoryFromMessageWithQuery
} from '../src/memory/memory-store.js';

test('durable user preference can be extracted and persisted', async () => {
  const stored = await storeMemoryFromMessageWithQuery(async (sql, params) => {
    assert.match(sql, /INSERT INTO memories/);
    assert.deepEqual(params.slice(0, 2), ['user-a', 'preference_pale_an_kreyol']);
    return { rows: [{ id: 1, key: params[1], value: params[2], source: params[3] }] };
  }, {
    userPhone: 'user-a',
    message: 'Mwen prefere pale an kreyol'
  });

  assert.equal(stored.value, 'User preference: pale an kreyol');
});

test('durable project fact can be extracted and persisted', async () => {
  const extraction = extractDurableMemory('M ap travay sou pwojè Vittusha AI');

  assert.equal(extraction.rejected, false);
  assert.equal(extraction.memory.key, 'project_vittusha_ai');
  assert.equal(extraction.memory.value, 'Project: Vittusha AI');
});

test('temporary messages are not stored as memory', () => {
  assert.equal(extractDurableMemory('ping').reason, 'temporary_information');
  assert.equal(extractDurableMemory('Bonjou').reason, 'temporary_information');
});

test('AI identity conflicts are rejected from memory', () => {
  const extraction = extractDurableMemory('Your name is Assistant AI');

  assert.equal(extraction.rejected, true);
  assert.equal(extraction.reason, 'ai_identity_conflict');
});

test('stored memory retrieval remains isolated between users', async () => {
  const rows = [
    { id: 1, user_phone: 'user-a', key: 'user_name', value: 'User name: Alice' }
  ];

  const memories = await loadMemoriesWithQuery(async (sql, params) => {
    assert.match(sql, /WHERE user_phone = \$1/);
    assert.deepEqual(params, ['user-a']);
    return { rows };
  }, { userPhone: 'user-a' });

  assert.deepEqual(memories, rows);
});
