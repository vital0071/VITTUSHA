import { detectLanguage } from '../services/language.js';

export class ContextBuilder {
  constructor({ memory, logger }) {
    this.memory = memory;
    this.logger = logger;
  }

  async build(input) {
    const detectedLanguage = input.metadata?.language || detectLanguage(input.message);
    const memoryContext = await this.memory.buildConversationContext({
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
      message: input.message,
      detectedLanguage,
      metadata: {
        ...input.metadata,
        channel: input.channel
      }
    });
    const memories = toLegacyMemories(memoryContext);

    this.logger.info('memory_loaded', {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
      memoryCount: memories.length,
      relevantMemoryCount: memoryContext.relevantMemories.length,
      recentMessageCount: memoryContext.recentMessages.length
    });

    return {
      ...input,
      detectedLanguage,
      memories,
      memoryContext
    };
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
