import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../../src/app.js';
import { Brain } from '../../src/brain/Brain.js';
import { TelegramGateway } from '../../src/channels/telegram/TelegramGateway.js';
import { ConversationMemory } from '../../src/memory/ConversationMemory.js';
import { MemoryRepository } from '../../src/memory/MemoryRepository.js';
import { MemoryService } from '../../src/memory/MemoryService.js';
import { ProjectManager } from '../../src/projects/ProjectManager.js';

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

function createMemoryService(logger) {
  const repository = new MemoryRepository({
    query: async () => {
      throw new Error('database disabled for E2E test');
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

  return new MemoryService({ repository, logger });
}

function createProjectManager(logger) {
  return new ProjectManager({
    logger,
    state: {
      projectsByUser: new Map(),
      activeProjectByUser: new Map(),
      nextProjectId: 1
    }
  });
}

function telegramTextUpdate({ text, messageId }) {
  return {
    update_id: 9000 + messageId,
    message: {
      message_id: messageId,
      from: {
        id: 50912345678,
        is_bot: false,
        first_name: 'Vital',
        username: 'vital'
      },
      chat: {
        id: 50912345678,
        type: 'private'
      },
      date: 1782864000 + messageId,
      text
    }
  };
}

async function postJson(app, path, payload) {
  const body = JSON.stringify(payload);
  const bodyBuffer = Buffer.from(body);
  const req = Readable.from([bodyBuffer]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    'content-length': bodyBuffer.length
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (payload) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };
    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
      },
      getHeader(name) {
        return this.headers[String(name).toLowerCase()];
      },
      removeHeader(name) {
        delete this.headers[String(name).toLowerCase()];
      },
      write(chunk) {
        this.body += chunk ? String(chunk) : '';
      },
      end(chunk) {
        if (chunk) {
          this.write(chunk);
        }
        finish({
          status: this.statusCode,
          body: this.body,
          headers: this.headers
        });
      }
    };

    app.handle(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      finish({ status: 404, body: '', headers: res.headers });
    });
  });
}

async function get(app, path) {
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = path;
  req.headers = {};

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (payload) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };
    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
      },
      getHeader(name) {
        return this.headers[String(name).toLowerCase()];
      },
      removeHeader(name) {
        delete this.headers[String(name).toLowerCase()];
      },
      write(chunk) {
        this.body += chunk ? String(chunk) : '';
      },
      end(chunk) {
        if (chunk) {
          this.write(chunk);
        }
        finish({
          status: this.statusCode,
          body: this.body,
          headers: this.headers
        });
      }
    };

    app.handle(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      finish({ status: 404, body: '', headers: res.headers });
    });
  });
}

test('E2E Telegram memory direct answer does not call OpenAI on known project question', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const sentReplies = [];
  let shouldFailIfOpenAIIsCalled = false;
  let openaiCallCount = 0;

  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    generateReply: async ({ userMessage }) => {
      openaiCallCount += 1;
      if (shouldFailIfOpenAIIsCalled) {
        throw new Error(`OpenAI must not be called for direct memory answer: ${userMessage}`);
      }
      return 'Compris.';
    }
  });

  class CapturingTelegramGateway extends TelegramGateway {
    async send({ reply }) {
      sentReplies.push(reply);
      return { reply, supported: true };
    }
  }

  const gateway = new CapturingTelegramGateway({ brain, logger, allowedChatId: '' });
  const app = createApp({ telegramGateway: gateway, logger });

  const firstResponse = await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Je développe Vittusha AI.',
    messageId: 1
  }));
  assert.equal(firstResponse.status, 200);

  shouldFailIfOpenAIIsCalled = true;
  const secondResponse = await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Quel projet je développe ?',
    messageId: 2
  }));
  assert.equal(secondResponse.status, 200);

  assert.deepEqual(sentReplies, ['Compris.', 'Vous développez Vittusha AI.']);
  assert.equal(openaiCallCount, 1);
  assert.equal(logger.events.some((event) => event.message === 'telegram_received'), true);
  assert.equal(logger.events.some((event) => event.message === 'brain_started' && event.channel === 'telegram'), true);
  assert.equal(logger.events.some((event) => event.message === 'message_received' && event.channel === 'telegram'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_extraction'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_lookup'), true);
  assert.equal(logger.events.some((event) => event.message === 'direct_memory_answer_attempt'), true);
  assert.equal(logger.events.some((event) => event.message === 'direct_memory_answer_success'), true);
  assert.equal(logger.events.some((event) => event.message === 'memory_used'), true);
  assert.equal(logger.events.some((event) => event.message === 'response_sent' && event.channel === 'telegram'), true);
});

test('E2E Telegram creates and lists projects through ProjectManager', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const sentReplies = [];
  let openaiCallCount = 0;
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    projectManager: createProjectManager(logger),
    generateReply: async () => {
      openaiCallCount += 1;
      throw new Error('OpenAI must not be called for ProjectManager E2E.');
    }
  });

  class CapturingTelegramGateway extends TelegramGateway {
    async send({ reply }) {
      sentReplies.push(reply);
      return { reply, supported: true };
    }
  }

  const app = createApp({
    telegramGateway: new CapturingTelegramGateway({ brain, logger, allowedChatId: '' }),
    logger
  });

  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Crée un projet appelé KonekteW',
    messageId: 20
  }));
  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Quels sont mes projets ?',
    messageId: 21
  }));

  assert.equal(sentReplies[0], 'Projet "KonekteW" créé.');
  assert.match(sentReplies[1], /KonekteW/);
  assert.equal(openaiCallCount, 0);
  assert.equal(logger.events.some((event) => event.message === 'intent_detected'), true);
  assert.equal(logger.events.some((event) => event.message === 'router_project_manager'), true);
  assert.equal(logger.events.some((event) => event.message === 'project_manager_success'), true);
  assert.equal(logger.events.some((event) => event.message === 'openai_skipped'), true);
  assert.equal(logger.events.some((event) => event.message === 'project_intent_detected'), true);
  assert.equal(logger.events.some((event) => event.message === 'project_created'), true);
});

test('E2E Telegram create project is intercepted before OpenAI', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const sentReplies = [];
  let openaiCallCount = 0;
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    projectManager: createProjectManager(logger),
    generateReply: async () => {
      openaiCallCount += 1;
      throw new Error('OpenAI must never be called for create project intent.');
    }
  });

  class CapturingTelegramGateway extends TelegramGateway {
    async send({ reply }) {
      sentReplies.push(reply);
      return { reply, supported: true };
    }
  }

  const app = createApp({
    telegramGateway: new CapturingTelegramGateway({ brain, logger, allowedChatId: '' }),
    logger
  });

  const response = await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Crée un projet appelé KonekteW',
    messageId: 22
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(sentReplies, ['Projet "KonekteW" créé.']);
  assert.equal(openaiCallCount, 0);
  assert.equal(logger.events.some((event) => event.message === 'router_project_manager'), true);
  assert.equal(logger.events.some((event) => event.message === 'project_manager_success' && event.projectIntent === 'create_project'), true);
  assert.equal(logger.events.some((event) => event.message === 'openai_skipped' && event.reason === 'project_manager_intent'), true);
});

test('ProjectManager success is terminal and no later OpenAI log appears', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    projectManager: createProjectManager(logger),
    generateReply: async () => {
      throw new Error('OpenAI must be unreachable after ProjectManager success.');
    }
  });

  const response = await brain.processMessage({
    tenantId: 'default',
    userId: 'terminal-user',
    channel: 'telegram',
    conversationId: 'terminal-chat',
    message: 'Crée un projet appelé KonekteW.',
    metadata: { language: 'fr' }
  });

  const successIndex = logger.events.findIndex((event) => event.message === 'project_manager_success');
  const terminalIndex = logger.events.findIndex((event) => event.message === 'project_manager_terminal');
  const openaiAfterSuccess = logger.events
    .slice(successIndex + 1)
    .some((event) => event.message === 'openai_called');

  assert.equal(response.reply, 'Projet "KonekteW" créé.');
  assert.notEqual(successIndex, -1);
  assert.notEqual(terminalIndex, -1);
  assert.equal(openaiAfterSuccess, false);
  assert.equal(logger.events.some((event) => event.message === 'agent_selected'), false);
});

test('E2E Telegram ProjectManager persists project state across messages', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const sentReplies = [];
  let openaiCallCount = 0;
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    projectManager: createProjectManager(logger),
    generateReply: async () => {
      openaiCallCount += 1;
      throw new Error('OpenAI must not be called for ProjectManager persistence flow.');
    }
  });

  class CapturingTelegramGateway extends TelegramGateway {
    async send({ reply }) {
      sentReplies.push(reply);
      return { reply, supported: true };
    }
  }

  const app = createApp({
    telegramGateway: new CapturingTelegramGateway({ brain, logger, allowedChatId: '' }),
    logger
  });

  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Crée un projet appelé KonekteW.',
    messageId: 23
  }));
  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Quels sont mes projets ?',
    messageId: 24
  }));
  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Quel est mon projet actif ?',
    messageId: 25
  }));
  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Sur quel projet je travaille ?',
    messageId: 26
  }));

  assert.equal(sentReplies[0], 'Projet "KonekteW" créé.');
  assert.match(sentReplies[1], /KonekteW/);
  assert.match(sentReplies[2], /KonekteW/);
  assert.match(sentReplies[3], /KonekteW/);
  assert.equal(openaiCallCount, 0);
  assert.equal(logger.events.filter((event) => event.message === 'openai_skipped').length, 4);
  assert.equal(logger.events.some((event) => event.message === 'active_project_set' && event.name === 'KonekteW'), true);
});

test('E2E Telegram answers active project through ProjectManager', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const sentReplies = [];
  let openaiCallCount = 0;
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    projectManager: createProjectManager(logger),
    generateReply: async () => {
      openaiCallCount += 1;
      throw new Error('OpenAI must not be called for active project E2E.');
    }
  });

  class CapturingTelegramGateway extends TelegramGateway {
    async send({ reply }) {
      sentReplies.push(reply);
      return { reply, supported: true };
    }
  }

  const app = createApp({
    telegramGateway: new CapturingTelegramGateway({ brain, logger, allowedChatId: '' }),
    logger
  });

  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Mon projet actif est Vittusha AI',
    messageId: 30
  }));
  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Sur quel projet je travaille ?',
    messageId: 31
  }));

  assert.equal(sentReplies[0], 'Projet actif défini : Vittusha AI.');
  assert.equal(sentReplies[1], 'Vous travaillez sur Vittusha AI.');
  assert.equal(openaiCallCount, 0);
  assert.equal(logger.events.some((event) => event.message === 'active_project_set'), true);
});

test('E2E Telegram adds and retrieves project notes through ProjectManager', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  const sentReplies = [];
  let openaiCallCount = 0;
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    projectManager: createProjectManager(logger),
    generateReply: async () => {
      openaiCallCount += 1;
      throw new Error('OpenAI must not be called for project note E2E.');
    }
  });

  class CapturingTelegramGateway extends TelegramGateway {
    async send({ reply }) {
      sentReplies.push(reply);
      return { reply, supported: true };
    }
  }

  const app = createApp({
    telegramGateway: new CapturingTelegramGateway({ brain, logger, allowedChatId: '' }),
    logger
  });

  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Ajoute une note au projet Vittusha AI: créer le dashboard admin',
    messageId: 40
  }));
  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Que sais-tu sur le projet Vittusha AI ?',
    messageId: 41
  }));

  assert.match(sentReplies[1], /créer le dashboard admin/);
  assert.equal(openaiCallCount, 0);
  assert.equal(logger.events.some((event) => event.message === 'project_note_added'), true);
  assert.equal(logger.events.some((event) => event.message === 'project_context_retrieved'), true);
});

test('debug routes return 404 when disabled', async () => {
  const app = createApp({ debugRoutesEnabled: false, logger: createLogger() });

  const memoryResponse = await get(app, '/debug/memory/1989082524');
  const brainResponse = await postJson(app, '/debug/brain-test', {
    chatId: '1989082524',
    message: 'Quel projet je développe ?'
  });

  assert.equal(memoryResponse.status, 404);
  assert.equal(brainResponse.status, 404);
});

test('WhatsApp webhook is inactive in the Telegram-only MVP runtime', async () => {
  const app = createApp({ logger: createLogger() });

  const getResponse = await get(app, '/webhook/whatsapp');
  const postResponse = await postJson(app, '/webhook/whatsapp', {});

  assert.equal(getResponse.status, 404);
  assert.equal(postResponse.status, 404);
});

test('debug brain-test uses the same Telegram Brain pipeline and reports direct memory answer', async () => {
  const logger = createLogger();
  const memoryService = createMemoryService(logger);
  let openaiCallCount = 0;
  const brain = new Brain({
    logger,
    memory: new ConversationMemory({ logger, service: memoryService }),
    generateReply: async () => {
      openaiCallCount += 1;
      return 'Compris.';
    }
  });
  const gateway = new TelegramGateway({ brain, logger, allowedChatId: '' });
  const app = createApp({
    telegramGateway: gateway,
    logger,
    debugRoutesEnabled: true
  });

  await postJson(app, '/webhook/telegram', telegramTextUpdate({
    text: 'Je développe Vittusha AI.',
    messageId: 10
  }));

  const debugResponse = await postJson(app, '/debug/brain-test', {
    chatId: '50912345678',
    message: 'Quel projet je développe ?'
  });
  const payload = JSON.parse(debugResponse.body);

  assert.equal(debugResponse.status, 200);
  assert.equal(payload.finalReply, 'Vous développez Vittusha AI.');
  assert.equal(payload.openaiCalled, false);
  assert.equal(payload.directAnswerResult?.matched, true);
  assert.equal(payload.retrievedMemories.some((memory) => memory.type === 'PROJECT'), true);
  assert.equal(openaiCallCount, 1);
});
