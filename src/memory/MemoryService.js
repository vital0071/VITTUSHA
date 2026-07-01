import { MemoryContextBuilder } from './MemoryContextBuilder.js';
import { MemoryExtractor } from './MemoryExtractor.js';
import { MemoryRepository } from './MemoryRepository.js';
import { MemoryRetriever } from './MemoryRetriever.js';

export class MemoryService {
  constructor({
    repository,
    extractor = new MemoryExtractor(),
    retriever,
    contextBuilder = new MemoryContextBuilder(),
    logger
  } = {}) {
    this.logger = logger;
    this.repository = repository ?? new MemoryRepository({ logger });
    this.extractor = extractor;
    this.retriever = retriever ?? new MemoryRetriever({
      repository: this.repository,
      logger
    });
    this.contextBuilder = contextBuilder;
  }

  async saveMemory(memory) {
    await this.repository.ensureUser({
      userId: memory.userId ?? memory.user_id,
      metadata: memory.metadata ?? {}
    });
    const saved = await this.repository.saveMemory(memory);
    this.logger?.info('memory_stored', {
      userId: saved.user_id,
      memoryId: saved.id,
      type: saved.type,
      title: saved.title,
      source: saved.source
    });
    this.logger?.info('memory_saved', {
      userId: saved.user_id,
      memoryId: saved.id,
      type: saved.type
    });
    return saved;
  }

  async searchMemory(params) {
    return this.repository.searchMemory(params);
  }

  async updateMemory(id, updates) {
    const updated = await this.repository.updateMemory(id, updates);
    if (updated) {
      this.logger?.info('memory_updated', {
        userId: updated.user_id,
        memoryId: updated.id,
        type: updated.type
      });
    }
    return updated;
  }

  async archiveMemory(id) {
    const archived = await this.repository.archiveMemory(id);
    if (archived) {
      this.logger?.info('memory_archived', {
        userId: archived.user_id,
        memoryId: archived.id,
        type: archived.type
      });
    }
    return archived;
  }

  async deleteMemory(id) {
    return this.repository.deleteMemory(id);
  }

  async findRelevantMemories(params) {
    return this.retriever.findRelevantMemories(params);
  }

  async buildConversationContext({
    tenantId = 'default',
    userId,
    conversationId,
    message,
    detectedLanguage,
    metadata = {}
  }) {
    await this.repository.ensureUser({
      userId,
      metadata: {
        ...metadata,
        tenantId,
        language: detectedLanguage
      }
    });

    const relevantMemories = await this.findRelevantMemories({
      userId,
      message,
      limit: 12
    });
    const recentMessages = await this.repository.findRecentMessages({
      userId,
      conversationId,
      limit: 20
    });
    const context = this.contextBuilder.build({
      userId,
      detectedLanguage,
      relevantMemories,
      recentMessages,
      currentConversation: {
        tenantId,
        conversationId,
        channel: metadata.channel
      }
    });

    this.logger?.info('memory_context_created', {
      tenantId,
      userId,
      conversationId,
      memoryCount: relevantMemories.length,
      recentMessageCount: recentMessages.length,
      sections: [
        'Current User',
        'Relevant Memories',
        'Recent Messages',
        'Preferences',
        'Projects',
        'Goals',
        'Business',
        'Language',
        'Current Conversation'
      ]
    });

    return context;
  }

  async recordConversationTurn({
    tenantId = 'default',
    userId,
    conversationId,
    message,
    answer,
    metadata = {}
  }) {
    await this.repository.ensureUser({
      userId,
      metadata: {
        ...metadata,
        tenantId
      }
    });

    await this.repository.saveConversationMessage({
      userId,
      conversationId,
      role: 'user',
      content: message,
      metadata
    });
    await this.repository.saveConversationMessage({
      userId,
      conversationId,
      role: 'assistant',
      content: answer,
      metadata
    });

    this.logger?.info('memory_extraction_started', {
      tenantId,
      userId,
      conversationId,
      message
    });
    const extracted = this.extractor.extract({
      message,
      assistantReply: answer
    });
    this.logger?.info('memory_extraction', {
      tenantId,
      userId,
      conversationId,
      memoryCount: extracted.length
    });
    this.logger?.info('memory_extracted', {
      tenantId,
      userId,
      conversationId,
      memoryCount: extracted.length,
      memories: extracted.map((memory) => ({
        type: memory.type,
        title: memory.title,
        confidence: memory.confidence,
        importance: memory.importance
      }))
    });
    for (const memory of extracted) {
      this.logger?.info('memory_extracted_type', {
        tenantId,
        userId,
        conversationId,
        type: memory.type,
        title: memory.title,
        confidence: memory.confidence,
        importance: memory.importance
      });
    }
    const saved = [];

    for (const memory of extracted) {
      this.logger?.info('memory_store_started', {
        tenantId,
        userId,
        conversationId,
        type: memory.type,
        title: memory.title,
        source: memory.source
      });
      saved.push(await this.saveMemory({
        ...memory,
        userId,
        metadata
      }));
    }

    return saved;
  }
}
