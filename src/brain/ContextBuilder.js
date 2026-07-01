import { detectLanguage } from '../services/language.js';

export class ContextBuilder {
  constructor({ memory, logger }) {
    this.memory = memory;
    this.logger = logger;
  }

  async build(input) {
    const detectedLanguage = input.metadata?.language || detectLanguage(input.message);
    const memories = await this.memory.load({
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId
    });

    this.logger.info('memory_loaded', {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
      memoryCount: memories.length
    });

    return {
      ...input,
      detectedLanguage,
      memories
    };
  }
}
