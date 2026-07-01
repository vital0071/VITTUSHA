import { brain as defaultBrain } from '../../brain/Brain.js';
import { config } from '../../config.js';
import { logger as defaultLogger } from '../../shared/logger.js';
import { ChannelGateway } from '../ChannelGateway.js';

export class TelegramGateway extends ChannelGateway {
  constructor({ brain = defaultBrain, logger = defaultLogger, fetchFn = fetch } = {}) {
    super();
    this.brain = brain;
    this.logger = logger;
    this.fetch = fetchFn;
  }

  receive(update = {}) {
    const normalized = this.normalizeMessage(update);
    return normalized ? [normalized] : [];
  }

  async send({ message, reply }) {
    if (!config.telegram.botToken) {
      this.logger.warn('telegram_send_skipped_missing_token', {
        channel: 'telegram',
        conversationId: message?.conversationId
      });
      return { reply, supported: false };
    }

    const response = await this.fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: message.conversationId,
        text: reply
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = body?.description ?? `Telegram send failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return body;
  }

  async typing(_message) {
    return { supported: false };
  }

  async acknowledge(_message) {
    return { acknowledged: true };
  }

  normalizeMessage(update = {}) {
    const message = update.message ?? update.edited_message ?? {};
    const from = message.from ?? {};
    const chat = message.chat ?? {};

    if (!message.text) {
      return null;
    }

    return {
      tenantId: 'default',
      userId: String(from.id ?? chat.id),
      channel: 'telegram',
      conversationId: String(chat.id),
      message: message.text,
      metadata: {
        telegramMessageId: message.message_id,
        chatId: chat.id,
        username: from.username,
        firstName: from.first_name,
        rawUpdate: update
      }
    };
  }

  async processUpdate(update) {
    const normalized = this.normalizeMessage(update);
    if (!normalized) {
      return null;
    }

    return this.handle(normalized);
  }

  async handle(normalized) {
    this.logger.info('telegram_received', {
      channel: 'telegram',
      userId: normalized.userId,
      conversationId: normalized.conversationId,
      telegramMessageId: normalized.metadata?.telegramMessageId
    });

    const brainResponse = await this.brain.processMessage(normalized);
    await this.send({ message: normalized, reply: brainResponse.reply });
    this.logger.info('response_sent', {
      channel: 'telegram',
      userId: normalized.userId,
      conversationId: normalized.conversationId,
      telegramMessageId: normalized.metadata?.telegramMessageId
    });
    return brainResponse;
  }
}
