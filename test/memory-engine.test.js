import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryExtractor } from '../src/memory/MemoryExtractor.js';
import { MemoryRepository } from '../src/memory/MemoryRepository.js';
import { MemoryService } from '../src/memory/MemoryService.js';
import { MEMORY_TYPES } from '../src/memory/MemoryTypes.js';
import { Brain } from '../src/brain/Brain.js';
import { ConversationMemory } from '../src/memory/ConversationMemory.js';

function createMemoryService(logger = { info() {}, warn() {}, error() {} }) {
  const repository = new MemoryRepository({
    query: async () => {
      throw new Error('database disabled for unit test');
    },
    logger,
    fallback: {
      users: new Map(),
      memories: new Map(),
      conversationMessages: new Map(),
      nextMemoryId: 1,
      nextMessageId: 1
    }
  });

  return new MemoryService({
    repository,
    logger
  });
}

test('extracts important personal, business, language, and objective memories', () => {
  const extractor = new MemoryExtractor();
  const memories = extractor.extract({
    message: [
      "Je m'appelle Jean.",
      'Je dirige ProSpace.',
      'Je parle français.',
      "Mon objectif est d'ouvrir une franchise."
    ].join(' ')
  });

  assert.equal(memories.find((memory) => memory.type === MEMORY_TYPES.PERSON)?.content, 'Jean');
  assert.equal(memories.find((memory) => memory.type === MEMORY_TYPES.BUSINESS)?.content, 'ProSpace');
  assert.equal(memories.find((memory) => memory.type === MEMORY_TYPES.LANGUAGE)?.content, 'français');
  assert.match(memories.find((memory) => memory.type === MEMORY_TYPES.OBJECTIVE)?.content, /franchise/);
});

test('extracts project memories from development statements', () => {
  const extractor = new MemoryExtractor();
  const cases = [
    'Je développe Vittusha AI.',
    'Map devlope Vittusha AI.',
    'M ap devlope Vittusha AI.',
    'Je travaille sur Vittusha AI.'
  ];

  for (const message of cases) {
    const memories = extractor.extract({ message });
    const project = memories.find((memory) => memory.type === MEMORY_TYPES.PROJECT);
    assert.equal(project?.title, 'Vittusha AI', message);
    assert.equal(project?.content, 'Vittusha AI', message);
  }
});

test('builds context that can answer the user name on day 2', async () => {
  const service = createMemoryService();

  await service.recordConversationTurn({
    userId: 'user-1',
    conversationId: 'conversation-1',
    message: "Je m'appelle Jean.",
    answer: 'Bonjour Jean.',
    metadata: { language: 'fr' }
  });

  const context = await service.buildConversationContext({
    userId: 'user-1',
    conversationId: 'conversation-2',
    message: "Comment je m'appelle ?",
    detectedLanguage: 'fr'
  });

  assert.match(context.promptText, /Nom: Jean/);
});

test('builds context that can answer the user business on day 2', async () => {
  const service = createMemoryService();

  await service.recordConversationTurn({
    userId: 'user-2',
    conversationId: 'conversation-1',
    message: 'Je dirige ProSpace.',
    answer: 'Vous dirigez ProSpace.',
    metadata: { language: 'fr' }
  });

  const context = await service.buildConversationContext({
    userId: 'user-2',
    conversationId: 'conversation-2',
    message: 'Quelle est mon entreprise ?',
    detectedLanguage: 'fr'
  });

  assert.match(context.promptText, /BUSINESS/);
  assert.match(context.promptText, /ProSpace/);
});

test('retrieves PROJECT memory for French and Creole project questions', async () => {
  const service = createMemoryService();
  await service.saveMemory({
    userId: 'user-project-retrieval',
    type: MEMORY_TYPES.PROJECT,
    title: 'Vittusha AI',
    content: 'Vittusha AI',
    importance: 0.85,
    confidence: 0.8
  });

  const questions = [
    'Quel projet je développe ?',
    'Ki pwojè m ap devlope ?',
    'Ki pwoje map devlope ?',
    'Sur quel projet je travaille ?'
  ];

  for (const question of questions) {
    const memories = await service.findRelevantMemories({
      userId: 'user-project-retrieval',
      message: question
    });

    assert.equal(
      memories.some((memory) => memory.type === MEMORY_TYPES.PROJECT && memory.content === 'Vittusha AI'),
      true,
      question
    );
  }
});

test('archives memories without deleting them from the repository fallback', async () => {
  const service = createMemoryService();
  const memory = await service.saveMemory({
    userId: 'user-3',
    type: MEMORY_TYPES.PREFERENCE,
    title: 'Format',
    content: 'Réponses courtes',
    importance: 0.6,
    confidence: 0.9
  });

  const archived = await service.archiveMemory(memory.id);
  const active = await service.searchMemory({ userId: 'user-3', query: 'courtes' });
  const all = await service.searchMemory({ userId: 'user-3', query: 'courtes', includeArchived: true });

  assert.equal(archived.is_archived, true);
  assert.equal(active.length, 0);
  assert.equal(all.length, 1);
});

test('Brain answers direct project questions from memory without asking the user to repeat', async () => {
  const logger = {
    events: [],
    info(message, meta = {}) {
      this.events.push({ level: 'info', message, ...meta });
    },
    warn() {},
    error() {}
  };
  const memoryService = createMemoryService(logger);
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    generateReply: async ({ userMessage }) => {
      if (/Quel projet je développe/i.test(userMessage)) {
        throw new Error('OpenAI should not be needed for direct memory answers.');
      }
      return 'Compris.';
    }
  });

  await brain.processMessage({
    tenantId: 'default',
    userId: 'user-project',
    channel: 'telegram',
    conversationId: 'day-1',
    message: 'Je développe Vittusha AI.',
    metadata: { language: 'fr' }
  });

  const response = await brain.processMessage({
    tenantId: 'default',
    userId: 'user-project',
    channel: 'telegram',
    conversationId: 'day-2',
    message: 'Quel projet je développe ?',
    metadata: { language: 'fr' }
  });

  assert.equal(response.reply, 'Vous développez Vittusha AI.');
  assert.equal(logger.events.some((event) => event.message === 'memory_extracted'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_extraction'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_extracted_type' && event.type === MEMORY_TYPES.PROJECT), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_stored'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_lookup'), true);
  assert.equal(logger.events.some((event) => event.message === 'memories_retrieved'), true);
  assert.equal(logger.events.some((event) => event.message === 'direct_memory_answer_attempt'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_direct_answer_match'), true);
  assert.equal(logger.events.some((event) => event.message === 'direct_memory_answer_success'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_used'), true);
});

test('Brain answers direct project questions from Creole memory', async () => {
  const logger = {
    events: [],
    info(message, meta = {}) {
      this.events.push({ level: 'info', message, ...meta });
    },
    warn() {},
    error() {}
  };
  const memoryService = createMemoryService(logger);
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    generateReply: async ({ userMessage }) => {
      if (/Ki pwojè m ap devlope/i.test(userMessage)) {
        throw new Error('OpenAI should not be needed for direct Creole memory answers.');
      }
      return 'Mwen konprann.';
    }
  });

  await brain.processMessage({
    tenantId: 'default',
    userId: 'user-project-ht',
    channel: 'telegram',
    conversationId: 'jou-1',
    message: 'M ap devlope Vittusha AI.',
    metadata: { language: 'ht' }
  });

  const response = await brain.processMessage({
    tenantId: 'default',
    userId: 'user-project-ht',
    channel: 'telegram',
    conversationId: 'jou-2',
    message: 'Ki pwojè m ap devlope ?',
    metadata: { language: 'ht' }
  });

  assert.equal(response.reply, 'W ap devlope Vittusha AI.');
  assert.equal(logger.events.some((event) => event.message === 'memory_extracted_type' && event.type === MEMORY_TYPES.PROJECT), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_direct_answer_match' && event.language === 'ht'), true);
  assert.equal(logger.events.some((event) => event.message === 'direct_memory_answer_success' && event.language === 'ht'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_used'), true);
});
