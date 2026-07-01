import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../../src/app.js';
import { Brain } from '../../src/brain/Brain.js';
import { TelegramGateway } from '../../src/channels/telegram/TelegramGateway.js';
import { ConversationMemory } from '../../src/memory/ConversationMemory.js';
import { MemoryRepository } from '../../src/memory/MemoryRepository.js';
import { MemoryService } from '../../src/memory/MemoryService.js';

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
        resolve({
          status: this.statusCode,
          body: this.body,
          headers: this.headers
        });
      }
    };

    app.handle(req, res, reject);
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

  const gateway = new CapturingTelegramGateway({ brain, logger });
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
