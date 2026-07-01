import { MemoryService } from './MemoryService.js';

export class ConversationMemory {
  constructor({ logger, service = new MemoryService({ logger }) } = {}) {
    this.logger = logger;
    this.service = service;
  }

  async load({ tenantId = 'default', userId, conversationId, message = '', detectedLanguage, metadata = {} }) {
    const context = await this.service.buildConversationContext({
      tenantId,
      userId,
      conversationId,
      message,
      detectedLanguage,
      metadata
    });

    return toLegacyMemories(context);
  }

  async buildConversationContext(input) {
    return this.service.buildConversationContext(input);
  }

  async append({ tenantId = 'default', userId, conversationId, message, answer, metadata = {} }) {
    return this.service.recordConversationTurn({
      tenantId,
      userId,
      conversationId,
      message,
      answer,
      metadata
    });
  }

  async storeFromMessage(_input) {
    return null;
  }
}

function toLegacyMemories(context) {
  return [
    ...context.relevantMemories.map((memory) => ({
      ...memory,
      key: memory.title,
      value: `[${memory.type}] ${memory.title}: ${memory.content}`,
      source: memory.source
    })),
    ...context.recentMessages.map((message, index) => ({
      id: `recent_${message.id ?? index}`,
      key: 'recent_message',
      value: `${message.role}: ${message.content}`,
      source: 'conversation'
    }))
  ];
}
