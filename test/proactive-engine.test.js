import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProactiveState, formatDailyCheckIn } from '../src/proactive-engine.js';

test('proactive engine detects pending and blocked tasks', () => {
  const now = new Date('2026-06-28T12:00:00Z');
  const analysis = analyzeProactiveState({
    now,
    tasks: [
      {
        id: 1,
        title: 'Approve email follow-up',
        status: 'pending',
        created_at: '2026-06-24T11:00:00Z',
        updated_at: '2026-06-24T11:00:00Z'
      },
      {
        id: 2,
        title: 'Prepare ProSpace plan',
        status: 'completed',
        created_at: '2026-06-27T11:00:00Z',
        updated_at: '2026-06-27T11:00:00Z'
      }
    ],
    pendingSuggestions: [],
    recentConversations: []
  });

  assert.equal(analysis.pendingTasks.length, 1);
  assert.equal(analysis.blockedTasks.length, 1);
  assert.ok(analysis.suggestions.some((suggestion) => suggestion.title === 'Travay sa bloke depi 3 jou.'));
  assert.ok(analysis.suggestions.some((suggestion) => suggestion.title === 'Ou gen yon task pending ki bezwen desizyon.'));
});

test('formats daily check-in in Haitian Creole', () => {
  const text = formatDailyCheckIn([
    {
      title: 'Ou gen 3 travay ki poko apwouve.',
      description: 'Revize travay sa yo.'
    }
  ]);

  assert.match(text, /Bonjou Vital-Herne/);
  assert.match(text, /Mwen pap egzekite okenn aksyon ekstèn san apwobasyon ou/);
});
