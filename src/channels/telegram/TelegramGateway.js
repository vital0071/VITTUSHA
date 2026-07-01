import { brain as defaultBrain } from '../../brain/Brain.js';
import { logger as defaultLogger } from '../../shared/logger.js';
import { ChannelGateway } from '../ChannelGateway.js';

export class TelegramGateway extends ChannelGateway {
  constructor({ brain = defaultBrain, logger = defaultLogger } = {}) {
    super();
    this.brain = brain;
    this.logger = logger;
  }

  receive(update = {}) {
    const normalized = this.normalizeMessage(update);
    return normalized ? [normalized] : [];
  }

  async send({ reply }) {
    return { reply, supported: false };
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

    const brainResponse = await this.brain.processMessage(normalized);
    await this.send({ message: normalized, reply: brainResponse.reply });
    return brainResponse;
  }
}
