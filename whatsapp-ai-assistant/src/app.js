import express from 'express';
import helmet from 'helmet';
import { logger } from './logger.js';
import { extractTelegramMessage, routeTelegramMessage } from './channels/telegram.js';
import { createV1Router } from './routes/v1.js';
import { sendError } from './routes/errors.js';

export function createApp(dependencies = {}) {
  const app = express();
  const deps = {
    extractTelegramMessage,
    routeTelegramMessage,
    createV1Router,
    logger,
    ...dependencies
  };

  app.use(helmet());
  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      req.rawBody = buffer.toString('utf8');
    }
  }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/v1', deps.createV1Router(dependencies.v1Dependencies));

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

  app.use((error, _req, res, _next) => {
    sendError(res, error);
  });

  return app;
}
