import express from 'express';
import helmet from 'helmet';
import { logger } from './logger.js';
import { extractTelegramMessage, routeTelegramMessage } from './channels/telegram.js';

export function createApp(dependencies = {}) {
  const app = express();
  const deps = {
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
