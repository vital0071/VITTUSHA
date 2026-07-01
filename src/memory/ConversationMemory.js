import { ensureCoreMemories, loadMemories, storeMemoryFromMessage } from './memory-store.js';
import { query } from '../db.js';

const inMemoryConversations = new Map();

export class ConversationMemory {
  constructor({
    logger,
    maxMessages = 20,
    ensureCore = ensureCoreMemories,
    loadLongTerm = loadMemories,
    storeLongTermFromMessage = storeMemoryFromMessage,
    queryFn = query
  } = {}) {
    this.logger = logger;
    this.maxMessages = maxMessages;
    this.ensureCore = ensureCore;
    this.loadLongTerm = loadLongTerm;
    this.storeLongTermFromMessage = storeLongTermFromMessage;
    this.query = queryFn;
  }

  async load({ userId, conversationId }) {
    let longTermMemories = [];

    try {
      await this.ensureCore({ userPhone: userId });
      longTermMemories = await this.loadLongTerm({ userPhone: userId });
    } catch (error) {
      this.logger?.warn('long_term_memory_postgres_unavailable', {
        error: error.message
      });
    }

    const recentMessages = await this.loadRecentMessages({ userId, conversationId });

    return [
      ...longTermMemories,
      ...recentMessages.map((item, index) => ({
        id: `recent_${index}`,
        key: 'recent_message',
        value: `${item.role}: ${item.content}`,
        source: 'conversation'
      }))
    ];
  }

  async append({ conversationId, message, answer }) {
    const key = this.key(conversationId);
    const current = inMemoryConversations.get(key) ?? [];
    const next = [
      ...current,
      { role: 'user', content: message, createdAt: new Date().toISOString() },
      { role: 'assistant', content: answer, createdAt: new Date().toISOString() }
    ].slice(-this.maxMessages);

    inMemoryConversations.set(key, next);
    return next;
  }

  async storeFromMessage({ userId, message }) {
    try {
      return await this.storeLongTermFromMessage({
        userPhone: userId,
        message
      });
    } catch (error) {
      this.logger?.warn('long_term_memory_store_unavailable', {
        error: error.message
      });
      return null;
    }
  }

  async loadRecentMessages({ userId, conversationId }) {
    try {
      const result = await this.query(
        `
          SELECT user_message, assistant_reply, created_at
          FROM conversations
          WHERE from_phone = $1
          ORDER BY created_at DESC
          LIMIT 10
        `,
        [userId]
      );

      return result.rows.reverse().flatMap((row) => {
        const messages = [
          {
            role: 'user',
            content: row.user_message,
            createdAt: row.created_at
          }
        ];

        if (row.assistant_reply) {
          messages.push({
            role: 'assistant',
            content: row.assistant_reply,
            createdAt: row.created_at
          });
        }

        return messages;
      }).slice(-this.maxMessages);
    } catch (error) {
      this.logger?.warn('conversation_memory_postgres_unavailable', {
        error: error.message
      });
      return inMemoryConversations.get(this.key(conversationId)) ?? [];
    }
  }

  key(conversationId) {
    return String(conversationId || 'default');
  }
}
