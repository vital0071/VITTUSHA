import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveSuggestion,
  createSuggestionWithQuery,
  dismissSuggestion,
  listPendingSuggestionsWithQuery,
  updateSuggestionStatusWithQuery
} from '../src/suggestions.js';

test('creates a suggestion', async () => {
  const created = await createSuggestionWithQuery(async (sql, params) => {
    assert.match(sql, /INSERT INTO suggestions/);
    assert.deepEqual(params, [
      '50912345678',
      'Ou gen 3 travay ki poko apwouve.',
      'Revize yo jodi a.',
      'approval_review',
      'high',
      'pending',
      12,
      JSON.stringify({ taskIds: [12, 13, 14] })
    ]);
    return {
      rows: [
        {
          id: 1,
          user_id: params[0],
          title: params[1],
          description: params[2],
          type: params[3],
          priority: params[4],
          status: params[5],
          related_task_id: params[6],
          metadata: JSON.parse(params[7])
        }
      ]
    };
  }, {
    userId: '50912345678',
    title: 'Ou gen 3 travay ki poko apwouve.',
    description: 'Revize yo jodi a.',
    type: 'approval_review',
    priority: 'high',
    relatedTaskId: 12,
    metadata: { taskIds: [12, 13, 14] }
  });

  assert.equal(created.id, 1);
  assert.equal(created.status, 'pending');
  assert.equal(created.priority, 'high');
});

test('lists pending suggestions', async () => {
  const rows = [{ id: 1, title: 'Men 5 aksyon ou ta dwe fè jodi a.', status: 'pending' }];
  const suggestions = await listPendingSuggestionsWithQuery(async (sql, params) => {
    assert.match(sql, /WHERE user_id = \$1 AND status = 'pending'/);
    assert.deepEqual(params, ['50912345678', 10]);
    return { rows };
  }, { userId: '50912345678' });

  assert.deepEqual(suggestions, rows);
});

test('approves a suggestion', async () => {
  const updated = await updateSuggestionStatusWithQuery(async (sql, params) => {
    assert.match(sql, /UPDATE suggestions/);
    assert.deepEqual(params, [1, '50912345678', 'approved']);
    return { rows: [{ id: 1, status: 'approved' }] };
  }, { userId: '50912345678', suggestionId: 1, status: 'approved' });

  assert.equal(updated.status, 'approved');
});

test('dismisses a suggestion', async () => {
  const updated = await updateSuggestionStatusWithQuery(async (_sql, params) => {
    assert.deepEqual(params, [2, '50912345678', 'dismissed']);
    return { rows: [{ id: 2, status: 'dismissed' }] };
  }, { userId: '50912345678', suggestionId: 2, status: 'dismissed' });

  assert.equal(updated.status, 'dismissed');
});
