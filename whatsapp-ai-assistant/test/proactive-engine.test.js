import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProactiveState, formatDailyCheckIn } from '../src/proactive-engine.js';
import { resolveCheckInTarget, startDailyCheckInScheduler } from '../src/scheduler/checkin.js';

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

test('resolves Telegram as proactive check-in target when configured', () => {
  assert.deepEqual(resolveCheckInTarget({
    telegram: {
      botToken: '123:abc',
      allowedChatId: '123456789'
    },
    meta: {},
    approvedPhoneNumber: ''
  }), {
    channel: 'telegram',
    userId: '123456789',
    chatId: '123456789'
  });
});

test('sends proactive check-in through Telegram', async () => {
  const scheduled = [];
  const sent = [];
  const timer = startDailyCheckInScheduler({
    config: {
      proactive: {
        enableCheckIn: true,
        checkInTime: '08:00'
      },
      telegram: {
        botToken: '123:abc',
        allowedChatId: '123456789'
      },
      meta: {},
      approvedPhoneNumber: ''
    },
    generateDailyCheckIn: async (input) => {
      assert.deepEqual(input, { userId: '123456789', persist: true });
      return 'Bonjou Vital-Herne. Men check-in jodi a.';
    },
    sendTelegramTextMessage: async (input) => {
      sent.push(input);
      return { ok: true };
    },
    sendWhatsAppTextMessage: async () => {
      throw new Error('WhatsApp should not be used');
    },
    setTimeout: (callback, delay) => {
      const item = { callback, delay };
      scheduled.push(item);
      return item;
    },
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  });

  assert.equal(timer, scheduled[0]);
  await scheduled[0].callback();
  assert.deepEqual(sent, [{
    chatId: '123456789',
    text: 'Bonjou Vital-Herne. Men check-in jodi a.'
  }]);
});
