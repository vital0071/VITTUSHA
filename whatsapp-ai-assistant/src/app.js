import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { logger } from './logger.js';
import { extractIncomingMessages, routeWhatsAppMessage } from './channels/whatsapp.js';
import { extractTelegramMessage, routeTelegramMessage } from './channels/telegram.js';

export function createApp(dependencies = {}) {
  const app = express();
  const deps = {
    extractIncomingMessages,
    routeWhatsAppMessage,
    extractTelegramMessage,
    routeTelegramMessage,
    logger,
    ...dependencies
  };

  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (config.meta.verifyToken && mode === 'subscribe' && token === config.meta.verifyToken) {
      logger.info('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }

    logger.warn('WhatsApp webhook verification failed');
    return res.sendStatus(403);
  });

  app.post('/webhook/whatsapp', async (req, res) => {
    const messages = deps.extractIncomingMessages(req.body);

    res.sendStatus(200);

    for (const message of messages) {
      await deps.routeWhatsAppMessage(message, req.body).catch((error) => {
        deps.logger.error('Unhandled WhatsApp channel error', {
          error: error.message,
          whatsappMessageId: message.whatsappMessageId
        });
      });
    }
  });

  app.post('/webhook/telegram', async (req, res) => {
    const message = deps.extractTelegramMessage(req.body);

    res.sendStatus(200);

    if (!message) {
      return;
    }

    await deps.routeTelegramMessage(message, req.body).catch((error) => {
      deps.logger.error('Unhandled Telegram channel error', {
        error: error.message,
        telegramMessageId: message.telegramMessageId
      });
    });
  });

  return app;
}
