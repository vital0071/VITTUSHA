import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTelegramMessage,
  formatTelegramTextMessage,
  routeTelegramMessage
} from '../src/channels/telegram.js';

test('extracts Telegram text messages', () => {
  const payload = {
    update_id: 1000,
    message: {
      message_id: 44,
      date: 1710000000,
      text: 'Bonjou',
      chat: { id: 123456789, type: 'private' },
      from: { id: 123456789, first_name: 'Vital', last_name: 'Zephy' }
    }
  };

  assert.deepEqual(extractTelegramMessage(payload), {
    telegramUpdateId: 1000,
    telegramMessageId: 44,
    chatId: '123456789',
    userId: '123456789',
    profileName: 'Vital Zephy',
    text: 'Bonjou',
    timestamp: new Date(1710000000 * 1000),
    rawMessage: payload.message
  });
});

test('formats Telegram responses for sendMessage', () => {
  assert.deepEqual(formatTelegramTextMessage({
    chatId: '123456789',
    text: 'Bonjou Vital-Herne.'
  }), {
    chat_id: '123456789',
    text: 'Bonjou Vital-Herne.',
    disable_web_page_preview: true
  });
});

test('routes approved Telegram messages to AI Core', async () => {
  const calls = [];
  const message = {
    telegramMessageId: 45,
    chatId: '123456789',
    userId: '123456789',
    profileName: 'Vital',
    text: 'Kisa m dwe fè jodi a?'
  };

  const result = await routeTelegramMessage(message, { update_id: 1001 }, {
    isApprovedTelegramChat: () => true,
    createIncomingConversation: async (conversation) => {
      calls.push(['conversation', conversation]);
      return { id: 21 };
    },
    processUserMessage: async (input) => {
      calls.push(['ai-core', input]);
      return {
        replyText: 'Men check-in jodi a.',
        language: 'ht',
        channel: 'telegram',
        userPhone: input.userPhone,
        userId: input.userId,
        metadata: { chatId: input.chatId, conversationId: input.conversationId }
      };
    },
    sendTelegramTextMessage: async (input) => {
      calls.push(['send', input]);
      return { ok: true, result: { message_id: 99 } };
    },
    markConversationReplied: async (input) => {
      calls.push(['replied', input]);
    },
    markConversationFailed: async () => {
      throw new Error('should not fail');
    },
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  });

  assert.equal(result.status, 'replied');
  assert.deepEqual(calls[1][1], {
    message: 'Kisa m dwe fè jodi a?',
    userPhone: '123456789',
    userId: '123456789',
    channel: 'telegram',
    language: 'ht',
    conversationId: 21,
    chatId: '123456789'
  });
  assert.equal(calls[2][1].chatId, '123456789');
  assert.equal(calls[2][1].text, 'Men check-in jodi a.');
});

test('rejects unauthorized Telegram chats', async () => {
  const sent = [];
  const result = await routeTelegramMessage({
    telegramMessageId: 46,
    chatId: '999',
    userId: '999',
    text: 'Hello'
  }, {}, {
    isApprovedTelegramChat: () => false,
    sendTelegramTextMessage: async (input) => {
      sent.push(input);
      return { ok: true };
    },
    createIncomingConversation: async () => {
      throw new Error('should not store unauthorized messages');
    },
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  });

  assert.equal(result.status, 'rejected');
  assert.deepEqual(sent, [{ chatId: '999', text: 'Unauthorized' }]);
});
