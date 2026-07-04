import test from 'node:test';
import assert from 'node:assert/strict';
import { extractIncomingMessages, routeWhatsAppMessage } from '../src/channels/whatsapp.js';
import { processUserMessage } from '../src/ai-core/agent.js';

test('extracts text messages from Meta webhook payload', () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: '50912345678', profile: { name: 'Vital' } }],
              messages: [
                {
                  id: 'wamid.123',
                  from: '50912345678',
                  timestamp: '1710000000',
                  type: 'text',
                  text: { body: 'Bonjou' }
                }
              ]
            }
          }
        ]
      }
    ]
  };

  assert.deepEqual(extractIncomingMessages(payload), [
    {
      whatsappMessageId: 'wamid.123',
      fromPhone: '50912345678',
      profileName: 'Vital',
      text: 'Bonjou',
      timestamp: new Date(1710000000 * 1000),
      rawMessage: payload.entry[0].changes[0].value.messages[0]
    }
  ]);
});

test('routes approved WhatsApp messages to AI Core', async () => {
  const calls = [];
  const message = {
    whatsappMessageId: 'wamid.456',
    fromPhone: '50912345678',
    profileName: 'Vital',
    text: 'Bonjou, ede mwen planifye jounen an.'
  };

  const result = await routeWhatsAppMessage(message, { object: 'whatsapp_business_account' }, {
    isApprovedPhoneNumber: () => true,
    createIncomingConversation: async (conversation) => {
      calls.push(['conversation', conversation]);
      return { id: 10 };
    },
    processUserMessage: async (input) => {
      calls.push(['ai-core', input]);
      return {
        replyText: 'Bonjou Vital-Herne.',
        language: 'ht',
        channel: 'whatsapp',
        userPhone: input.userPhone,
        toolNeeded: null,
        taskId: null,
        requiresApproval: false
      };
    },
    sendWhatsAppTextMessage: async (input) => {
      calls.push(['send', input]);
      return { messages: [{ id: 'sent.1' }] };
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
  assert.equal(calls[1][0], 'ai-core');
  assert.deepEqual(calls[1][1], {
    message: 'Bonjou, ede mwen planifye jounen an.',
    userPhone: '50912345678',
    channel: 'whatsapp',
    language: 'ht'
  });
  assert.equal(calls[2][1].text, 'Bonjou Vital-Herne.');
});

test('routes WhatsApp proactive commands through AI Core', async () => {
  const message = {
    whatsappMessageId: 'wamid.789',
    fromPhone: '50912345678',
    profileName: 'Vital',
    text: 'Montre m suggestions yo'
  };

  const result = await routeWhatsAppMessage(message, {}, {
    isApprovedPhoneNumber: () => true,
    createIncomingConversation: async () => ({ id: 11 }),
    processUserMessage: (input) => processUserMessage({
      ...input,
      dependencies: {
        listPendingSuggestions: async () => [
          {
            id: 1,
            title: 'Ou gen yon task pending ki bezwen desizyon.',
            description: 'Revize task la.',
            status: 'pending'
          }
        ],
        formatSuggestionsList: (suggestions) => suggestions.map((suggestion) => `${suggestion.id}. ${suggestion.title}`).join('\n')
      }
    }),
    sendWhatsAppTextMessage: async (input) => ({ sentText: input.text }),
    markConversationReplied: async () => {},
    markConversationFailed: async () => {},
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  });

  assert.equal(result.status, 'replied');
  assert.equal(result.agentResponse.proactiveCommand, 'list');
  assert.match(result.agentResponse.replyText, /task pending/);
});
