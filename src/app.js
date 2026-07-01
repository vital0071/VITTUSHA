import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { logger } from './logger.js';
import { createChannelGatewayRegistry } from './channels/ChannelGatewayRegistry.js';

export function createApp(dependencies = {}) {
  const app = express();
  const deps = {
    channelGateways: createChannelGatewayRegistry(dependencies),
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

    if (mode === 'subscribe' && token === config.meta.verifyToken) {
      logger.info('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }

    logger.warn('WhatsApp webhook verification failed');
    return res.sendStatus(403);
  });

  app.post('/webhook/whatsapp', async (req, res) => {
    const gateway = deps.channelGateways.get('whatsapp');
    if (!gateway) {
      deps.logger.error('No gateway registered for webhook channel', { channel: 'whatsapp' });
      return res.sendStatus(503);
    }

    const messages = gateway.receive(req.body);

    res.sendStatus(200);

    for (const message of messages) {
      await gateway.acknowledge(message);
      await gateway.handle(message).catch((error) => {
        deps.logger.error('Unhandled WhatsApp channel error', {
          error: error.message,
          whatsappMessageId: message.channelMessageId
        });
      });
    }
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

  return app;
}
