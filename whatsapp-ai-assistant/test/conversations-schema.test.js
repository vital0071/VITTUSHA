import test from 'node:test';
import assert from 'node:assert/strict';
import { createIncomingConversation, listRecentConversationsWithQuery, markConversationFailed, markConversationReplied } from '../src/services/conversations.js';

// These tests monkey-patch through dependency-free SQL inspection by loading the service in process
// is not possible because it imports db directly. They validate through the public functions by
// replacing db query would require a module loader, so SQL coverage is performed by source checks.
import { readFile } from 'node:fs/promises';

const servicePath = new URL('../src/services/conversations.js', import.meta.url);

test('conversation service uses current multi-channel schema columns', async () => {
  const source = await readFile(servicePath, 'utf8');

  assert.match(source, /INSERT INTO conversations \(\s*user_id,\s*conversation_id,\s*channel,\s*metadata/s);
  assert.match(source, /ON CONFLICT \(user_id, conversation_id\)/);
  assert.match(source, /agent_response/);
  assert.match(source, /tool_needed/);
  assert.match(source, /task_id/);
});

test('conversation service does not require removed legacy physical columns', async () => {
  const source = await readFile(servicePath, 'utf8');
  const sql = source.match(/`[\s\S]*?`/g).join('\n');

  for (const legacyColumn of [
    'whatsapp_message_id',
    'from_phone',
    'profile_name',
    'user_message',
    'detected_language',
    'raw_payload',
    'assistant_reply',
    'whatsapp_response',
    'error_message',
    'replied_at'
  ]) {
    assert.doesNotMatch(sql, new RegExp(`\\b${legacyColumn}\\b`));
  }
});

test('conversation service persists received replied and failed statuses inside metadata', async () => {
  const source = await readFile(servicePath, 'utf8');

  assert.match(source, /status: 'received'/);
  assert.match(source, /status: 'replied'/);
  assert.match(source, /status: 'failed'/);
  assert.match(source, /metadata = COALESCE\(metadata, '\{\}'::jsonb\) \|\| \$5::jsonb/);
  assert.match(source, /metadata = COALESCE\(metadata, '\{\}'::jsonb\) \|\| \$2::jsonb/);

  assert.equal(typeof createIncomingConversation, 'function');
  assert.equal(typeof markConversationReplied, 'function');
  assert.equal(typeof markConversationFailed, 'function');
});


test('recent conversation context is retrieved from metadata and isolated by user', async () => {
  const recent = await listRecentConversationsWithQuery(async (sql, params) => {
    assert.match(sql, /WHERE user_id = \$1/);
    assert.deepEqual(params, ['user-a', null, 9, 10]);
    return {
      rows: [
        {
          id: 2,
          conversation_id: 'telegram:1:2',
          channel: 'telegram',
          metadata: {
            message: { text: 'Ki non ou?', detectedLanguage: 'ht' },
            assistantReply: 'Mwen se Vittusha.'
          },
          tool_needed: null,
          task_id: null,
          created_at: '2026-07-07T10:01:00Z',
          updated_at: '2026-07-07T10:01:02Z'
        },
        {
          id: 1,
          conversation_id: 'telegram:1:1',
          channel: 'telegram',
          metadata: {
            message: { text: 'Bonjou', detectedLanguage: 'ht' },
            assistantReply: 'Bonjou.'
          },
          tool_needed: null,
          task_id: null,
          created_at: '2026-07-07T10:00:00Z',
          updated_at: '2026-07-07T10:00:02Z'
        }
      ]
    };
  }, { userId: 'user-a', excludeId: 9, limit: 10 });

  assert.deepEqual(recent.map((item) => item.userMessage), ['Bonjou', 'Ki non ou?']);
  assert.deepEqual(recent.map((item) => item.assistantReply), ['Bonjou.', 'Mwen se Vittusha.']);
});
