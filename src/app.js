import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { logger } from './logger.js';
import { createChannelGatewayRegistry } from './channels/ChannelGatewayRegistry.js';
import { findDirectMemoryAnswer } from './memory/MemoryDirectAnswer.js';
import { MEMORY_TYPES } from './memory/MemoryTypes.js';

export function createApp(dependencies = {}) {
  const app = express();
  const deps = {
    channelGateways: createChannelGatewayRegistry(dependencies),
    debugRoutesEnabled: config.debug.routesEnabled,
    logger,
    ...dependencies
  };

  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/webhook/telegram', async (req, res) => {
    const gateway = deps.channelGateways.get('telegram');
    if (!gateway) {
      deps.logger.error('No gateway registered for webhook channel', { channel: 'telegram' });
      return res.sendStatus(503);
    }

    const messages = gateway.receive(req.body);

    for (const message of messages) {
      await gateway.acknowledge(message);
      await gateway.handle(message).catch((error) => {
        deps.logger.error('Unhandled Telegram channel error', {
          error: error.message,
          telegramMessageId: message.metadata?.telegramMessageId
        });
      });
    }

    return res.sendStatus(200);
  });

  app.get('/debug/memory/:chatId', async (req, res) => {
    if (!deps.debugRoutesEnabled) {
      return res.sendStatus(404);
    }

    const chatId = String(req.params.chatId);
    const gateway = deps.channelGateways.get('telegram');
    const activeBrain = deps.brain ?? gateway?.brain;
    const memoryService = getMemoryService(activeBrain);

    if (!memoryService) {
      return res.status(500).json({ error: 'Memory service unavailable on active Brain.' });
    }

    const lastMessages = await memoryService.repository.findRecentMessages({
      userId: chatId,
      conversationId: chatId,
      limit: 10
    });
    const storedMemories = await memoryService.searchMemory({
      userId: chatId,
      query: '',
      includeArchived: true,
      limit: 100
    });
    const projectMemories = await memoryService.searchMemory({
      userId: chatId,
      type: MEMORY_TYPES.PROJECT,
      includeArchived: true,
      limit: 20
    });
    const memoryContext = await memoryService.buildConversationContext({
      tenantId: 'default',
      userId: chatId,
      conversationId: chatId,
      message: 'Quel projet je développe ?',
      detectedLanguage: 'fr',
      metadata: { channel: 'telegram', debug: true }
    });
    const directMemoryAnswer = findDirectMemoryAnswer({
      message: 'Quel projet je développe ?',
      memoryContext,
      detectedLanguage: 'fr'
    });

    return res.json({
      userId: chatId,
      conversationId: chatId,
      lastMessages,
      storedMemories,
      projectMemories,
      directMemoryAnswer
    });
  });

  app.post('/debug/brain-test', async (req, res) => {
    if (!deps.debugRoutesEnabled) {
      return res.sendStatus(404);
    }

    const chatId = String(req.body?.chatId ?? '');
    const message = String(req.body?.message ?? '');
    if (!chatId || !message) {
      return res.status(400).json({ error: 'chatId and message are required.' });
    }

    const gateway = deps.channelGateways.get('telegram');
    const activeBrain = deps.brain ?? gateway?.brain;
    if (!activeBrain) {
      return res.status(500).json({ error: 'Active Brain unavailable.' });
    }

    const response = await activeBrain.processMessage({
      tenantId: 'default',
      userId: chatId,
      channel: 'telegram',
      conversationId: chatId,
      message,
      metadata: {
        chatId,
        debug: true,
        language: 'fr'
      }
    });

    return res.json({
      userId: chatId,
      conversationId: chatId,
      retrievedMemories: response.metadata?.retrievedMemories ?? [],
      directAnswerResult: response.metadata?.directMemoryAnswer ?? null,
      openaiCalled: response.metadata?.openaiCalled ?? null,
      finalReply: response.reply,
      responseSource: response.metadata?.responseSource ?? null,
      openaiError: response.metadata?.openaiError ?? null
    });
  });

  return app;
}

function getMemoryService(activeBrain) {
  return activeBrain?.memory?.service ?? null;
}
