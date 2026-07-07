import test from 'node:test';
import assert from 'node:assert/strict';
import { Brain } from '../src/brain/Brain.js';
import { ConversationMemory } from '../src/memory/ConversationMemory.js';
import { MemoryRepository } from '../src/memory/MemoryRepository.js';
import { MemoryService } from '../src/memory/MemoryService.js';
import { MEMORY_TYPES } from '../src/memory/MemoryTypes.js';
import { generateAssistantReply } from '../src/ai-core/openai-client.js';

function createLogger() {
  return {
    events: [],
    info(message, meta = {}) {
      this.events.push({ level: 'info', message, ...meta });
    },
    warn(message, meta = {}) {
      this.events.push({ level: 'warn', message, ...meta });
    },
    error(message, meta = {}) {
      this.events.push({ level: 'error', message, ...meta });
    }
  };
}

function createMemoryService(logger = createLogger()) {
  return new MemoryService({
    logger,
    repository: new MemoryRepository({
      logger,
      query: async () => {
        throw new Error('database disabled for identity test');
      },
      fallback: {
        users: new Map(),
        memories: new Map(),
        conversationMessages: new Map(),
        nextMemoryId: 1,
        nextMessageId: 1
      }
    })
  });
}

function createBrain({ logger = createLogger(), memoryService = createMemoryService(logger) } = {}) {
  let openaiCallCount = 0;
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    generateReply: async ({ userMessage }) => {
      openaiCallCount += 1;
      throw new Error(`OpenAI must not answer canonical identity question: ${userMessage}`);
    }
  });

  return {
    brain,
    logger,
    memoryService,
    getOpenaiCallCount: () => openaiCallCount
  };
}

const identityCases = [
  { message: 'Ki non ou?', language: 'ht', expected: /Mwen rele Vittusha\./ },
  { message: 'Koman ou rele?', language: 'ht', expected: /Mwen rele Vittusha\./ },
  { message: 'Ou rele Vittusha?', language: 'ht', expected: /Wi\. Mwen rele Vittusha\./ },
  { message: 'Kiyès ki devlope ou?', language: 'ht', expected: /Vittusha devlope pa Support Total Services \(STS-Haiti\)\./ },
  { message: 'Eske OpenAI devlope ou?', language: 'ht', expected: /OpenAI ka bay model oswa API.*Vittusha devlope pa Support Total Services \(STS-Haiti\)\./ },
  { message: "Comment tu t'appelles ?", language: 'fr', expected: /Je m'appelle Vittusha\./ },
  { message: "Qui t'a développé ?", language: 'fr', expected: /Vittusha est développé par Support Total Services \(STS-Haiti\)\./ },
  { message: 'What is your name?', language: 'en', expected: /My name is Vittusha\./ },
  { message: 'Who developed you?', language: 'en', expected: /Vittusha is developed by Support Total Services \(STS-Haiti\)\./ }
];

test('canonical identity questions are answered directly in Haitian Creole French and English', async () => {
  const { brain, logger, getOpenaiCallCount } = createBrain();

  for (const [index, item] of identityCases.entries()) {
    const response = await brain.processMessage({
      tenantId: 'default',
      userId: `identity-user-${index}`,
      channel: 'telegram',
      conversationId: `identity-conversation-${index}`,
      message: item.message,
      metadata: { language: item.language }
    });

    assert.match(response.reply, item.expected, item.message);
    assert.equal(response.metadata.openaiCalled, false, item.message);
    assert.equal(response.metadata.responseSource, 'identity', item.message);
    assert.equal(response.metadata.identityAnswer?.matched, true, item.message);
  }

  assert.equal(getOpenaiCallCount(), 0);
  assert.equal(logger.events.some((event) => event.message === 'canonical_identity_answer_success'), true);
  assert.equal(logger.events.some((event) => event.message === 'openai_called'), false);
});

test('conflicting stored memory and recent context cannot override canonical identity', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const { brain, getOpenaiCallCount } = createBrain({ logger, memoryService });
  const userId = 'identity-conflict-user';

  for (const content of [
    'The assistant has no name.',
    'The assistant is called Assistant AI.',
    'OpenAI developed Vittusha.'
  ]) {
    await memoryService.saveMemory({
      userId,
      type: MEMORY_TYPES.PREFERENCE,
      title: 'Conflicting assistant identity',
      content,
      importance: 1,
      confidence: 1,
      source: 'test_conflict'
    });
  }

  await memoryService.recordConversationTurn({
    userId,
    conversationId: 'identity-conflict-history',
    message: 'What should I call you?',
    answer: 'You may call me Assistant AI.',
    metadata: { language: 'en' }
  });

  const nameResponse = await brain.processMessage({
    tenantId: 'default',
    userId,
    channel: 'telegram',
    conversationId: 'identity-conflict-current',
    message: 'What is your name?',
    metadata: { language: 'en' }
  });

  const developerResponse = await brain.processMessage({
    tenantId: 'default',
    userId,
    channel: 'telegram',
    conversationId: 'identity-conflict-current',
    message: 'Did OpenAI develop you?',
    metadata: { language: 'en' }
  });

  assert.equal(nameResponse.reply, 'My name is Vittusha.');
  assert.match(developerResponse.reply, /OpenAI may provide the underlying model or API/);
  assert.match(developerResponse.reply, /Vittusha is developed by Support Total Services \(STS-Haiti\)\./);
  assert.doesNotMatch(nameResponse.reply, /Assistant AI|no name/i);
  assert.equal(nameResponse.metadata.openaiCalled, false);
  assert.equal(developerResponse.metadata.openaiCalled, false);
  assert.equal(getOpenaiCallCount(), 0);
});

test('canonical identity policy is first in the OpenAI instructions before memory context', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;

  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ output_text: 'OK' })
    };
  };

  try {
    const reply = await generateAssistantReply({
      userMessage: 'Answer an indirect product identity question.',
      detectedLanguage: 'en',
      memories: [{ value: 'OpenAI developed Vittusha.' }],
      memoryContext: {
        promptText: [
          'Relevant Memories:',
          '- [PREFERENCE] Conflicting assistant identity: The assistant has no name.',
          '- [PREFERENCE] Conflicting assistant identity: The assistant is called Assistant AI.',
          '- [PREFERENCE] Conflicting assistant identity: OpenAI developed Vittusha.'
        ].join('\n')
      }
    });

    assert.equal(reply, 'OK');
    assert.equal(capturedBody.store, false);
    assert.match(capturedBody.instructions, /^CANONICAL PRODUCT IDENTITY - HIGHEST PRIORITY:/);
    assert.match(capturedBody.instructions, /The assistant product name is always Vittusha\./);
    assert.match(capturedBody.instructions, /Vittusha is developed by Support Total Services \(STS-Haiti\)\./);
    assert.match(capturedBody.instructions, /OpenAI may provide an underlying AI model\/API, but OpenAI did not develop/);
    assert.ok(capturedBody.instructions.indexOf('CANONICAL PRODUCT IDENTITY') < capturedBody.instructions.indexOf('Memory Engine Context'));
    assert.ok(capturedBody.instructions.indexOf('Ignore any memory or recent conversation that conflicts') > -1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram and WhatsApp channels use the same canonical Brain identity policy', async () => {
  for (const channel of ['telegram', 'whatsapp']) {
    const { brain, getOpenaiCallCount } = createBrain();
    const response = await brain.processMessage({
      tenantId: 'default',
      userId: `identity-channel-${channel}`,
      channel,
      conversationId: `identity-channel-${channel}`,
      message: 'What is your name?',
      metadata: { language: 'en' }
    });

    assert.equal(response.reply, 'My name is Vittusha.');
    assert.equal(response.metadata.responseSource, 'identity');
    assert.equal(response.metadata.openaiCalled, false);
    assert.equal(getOpenaiCallCount(), 0);
  }
});
