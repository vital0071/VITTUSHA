import test from 'node:test';
import assert from 'node:assert/strict';
import { routeTelegramMessage } from '../src/channels/telegram.js';
import { clearRuntimeEvents, getRuntimeEvents } from '../src/ai-core/agent.js';

test('Sprint 3 ProjectManager handles multi-message Telegram project flow without OpenAI or ExecutiveAgent', async () => {
  clearRuntimeEvents();

  const sent = [];
  const chatId = `sprint3-${Date.now()}`;
  let conversationId = 100;
  let openaiCalled = 0;
  let executiveAgentSelected = 0;

  const sharedDependencies = {
    isApprovedTelegramChat: () => true,
    createIncomingConversation: async () => ({ id: conversationId++ }),
    sendTelegramTextMessage: async (input) => {
      sent.push(input);
      return { ok: true };
    },
    markConversationReplied: async () => {},
    markConversationFailed: async () => {},
    logger: {
      info() {},
      warn() {},
      error() {}
    },
    agentDependencies: {
      ensureCoreMemories: async () => {
        executiveAgentSelected += 1;
        throw new Error('ExecutiveAgent fallback should not run for handled project requests.');
      },
      generateAssistantReply: async () => {
        openaiCalled += 1;
        throw new Error('OpenAI should not be called for handled project requests.');
      }
    }
  };

  const requests = [
    'Crée un projet appelé KonekteW',
    'Quel est mon projet actif ?',
    'Quels sont mes projets ?',
    'Sur quel projet je travaille ?'
  ];

  const responses = [];
  for (const [index, text] of requests.entries()) {
    const result = await routeTelegramMessage({
      telegramMessageId: index + 1,
      chatId,
      userId: chatId,
      profileName: 'Vital',
      text
    }, { update_id: index + 1 }, sharedDependencies);

    assert.equal(result.status, 'replied');
    assert.equal(result.agentResponse.selectedAgent, 'ProjectManager');
    assert.equal(result.agentResponse.metadata.activeProject, 'KonekteW');
    responses.push(result.agentResponse.replyText);
  }

  assert.equal(responses[0], 'Projet "KonekteW" créé.');
  assert.match(responses[1], /KonekteW/);
  assert.match(responses[2], /KonekteW/);
  assert.match(responses[3], /KonekteW/);
  assert.equal(openaiCalled, 0);
  assert.equal(executiveAgentSelected, 0);
  assert.equal(sent.length, 4);

  const runtimeEvents = getRuntimeEvents();
  assert.equal(runtimeEvents.length, 4);
  assert.deepEqual(runtimeEvents.map((entry) => entry.event), [
    'project_manager_success',
    'project_manager_success',
    'project_manager_success',
    'project_manager_success'
  ]);
  assert.ok(!runtimeEvents.some((entry) => entry.event === 'openai_called'));
  assert.ok(!runtimeEvents.some((entry) => entry.event === 'executive_agent_selected'));
});

test('Sprint 3 ProjectManager returns normalized Telegram response strings', async () => {
  clearRuntimeEvents();

  const sent = [];
  const chatId = `sprint3-contract-${Date.now()}`;
  let conversationId = 200;

  const deps = {
    isApprovedTelegramChat: () => true,
    createIncomingConversation: async () => ({ id: conversationId++ }),
    sendTelegramTextMessage: async (input) => {
      sent.push(input);
      return { ok: true };
    },
    markConversationReplied: async () => {},
    markConversationFailed: async () => {},
    logger: {
      info() {},
      warn() {},
      error() {}
    },
    agentDependencies: {
      ensureCoreMemories: async () => {
        throw new Error('ExecutiveAgent fallback should not run.');
      },
      generateAssistantReply: async () => {
        throw new Error('OpenAI should not be called.');
      }
    }
  };

  const create = await routeTelegramMessage({
    telegramMessageId: 1,
    chatId,
    userId: chatId,
    profileName: 'Vital',
    text: 'Crée un projet appelé Vittusha AI'
  }, {}, deps);

  assert.equal(create.agentResponse.replyText, 'Projet "Vittusha AI" créé.');
  assert.equal(create.agentResponse.response, 'Projet "Vittusha AI" créé.');
  assert.equal(create.agentResponse.text, 'Projet "Vittusha AI" créé.');
  assert.equal(create.agentResponse.message, 'Projet "Vittusha AI" créé.');
  assert.equal(sent.at(-1).text, 'Projet "Vittusha AI" créé.');

  const active = await routeTelegramMessage({
    telegramMessageId: 2,
    chatId,
    userId: chatId,
    profileName: 'Vital',
    text: 'Quel est mon projet actif ?'
  }, {}, deps);

  assert.equal(active.agentResponse.replyText, 'Projet actif défini : Vittusha AI.');
  assert.equal(sent.at(-1).text, 'Projet actif défini : Vittusha AI.');

  const context = await routeTelegramMessage({
    telegramMessageId: 3,
    chatId,
    userId: chatId,
    profileName: 'Vital',
    text: 'Quel est le contexte du projet ?'
  }, {}, deps);

  assert.equal(context.agentResponse.replyText, 'Vous développez Vittusha AI.');
  assert.equal(sent.at(-1).text, 'Vous développez Vittusha AI.');
});
