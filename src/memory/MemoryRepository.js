import { query as defaultQuery } from '../db.js';
import { MEMORY_TYPES, isMemoryType } from './MemoryTypes.js';

const fallbackState = {
  users: new Map(),
  memories: new Map(),
  conversationMessages: new Map(),
  nextMemoryId: 1,
  nextMessageId: 1
};

export class MemoryRepository {
  constructor({ query = defaultQuery, logger, fallback = fallbackState } = {}) {
    this.query = query;
    this.logger = logger;
    this.fallback = fallback;
  }

  async ensureUser({ userId, metadata = {} }) {
    try {
      const result = await this.query(
        `
          INSERT INTO users (id, external_id, display_name, language, metadata)
          VALUES ($1, $1, $2, $3, $4)
          ON CONFLICT (id)
          DO UPDATE SET
            display_name = COALESCE(EXCLUDED.display_name, users.display_name),
            language = COALESCE(EXCLUDED.language, users.language),
            updated_at = NOW()
          RETURNING *
        `,
        [
          String(userId),
          metadata.profileName ?? metadata.firstName ?? null,
          metadata.language ?? null,
          metadata
        ]
      );
      return result.rows[0];
    } catch (error) {
      this.warn('memory_repository_users_fallback', error);
      const user = {
        id: String(userId),
        external_id: String(userId),
        display_name: metadata.profileName ?? metadata.firstName ?? null,
        language: metadata.language ?? null,
        metadata
      };
      this.fallback.users.set(String(userId), user);
      return user;
    }
  }

  async saveMemory(memory) {
    const normalized = normalizeMemory(memory);

    try {
      const existing = await this.findExistingMemory(normalized);
      if (existing) {
        return this.updateMemory(existing.id, {
          content: normalized.content,
          importance: Math.max(Number(existing.importance ?? 0), normalized.importance),
          confidence: Math.max(Number(existing.confidence ?? 0), normalized.confidence),
          source: normalized.source
        });
      }

      const result = await this.query(
        `
          INSERT INTO memories (
            user_phone,
            key,
            value,
            user_id,
            type,
            title,
            content,
            importance,
            confidence,
            source
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          normalized.user_id,
          normalized.key,
          normalized.content,
          normalized.user_id,
          normalized.type,
          normalized.title,
          normalized.content,
          normalized.importance,
          normalized.confidence,
          normalized.source
        ]
      );
      return result.rows[0];
    } catch (error) {
      this.warn('memory_repository_save_fallback', error);
      return this.saveFallbackMemory(normalized);
    }
  }

  async searchMemory({ userId, query = '', type = null, limit = 20, includeArchived = false }) {
    try {
      const terms = tokenizeQuery(query);
      const params = [String(userId), `%${query}%`, terms, includeArchived, limit];
      const typeFilter = type ? 'AND type = $6' : '';
      if (type) {
        params.push(type);
      }

      const result = await this.query(
        `
          SELECT *
          FROM memories
          WHERE user_id = $1
            AND (
              $2 = '%%'
              OR title ILIKE $2
              OR content ILIKE $2
              OR type ILIKE $2
              OR cardinality($3::text[]) = 0
              OR EXISTS (
                SELECT 1
                FROM unnest($3::text[]) AS term
                WHERE title ILIKE '%' || term || '%'
                   OR content ILIKE '%' || term || '%'
                   OR type ILIKE '%' || term || '%'
              )
            )
            AND ($4::boolean = true OR is_archived = false)
            ${typeFilter}
          ORDER BY importance DESC, confidence DESC, updated_at DESC
          LIMIT $5
        `,
        params
      );
      return result.rows;
    } catch (error) {
      this.warn('memory_repository_search_fallback', error);
      return this.searchFallbackMemory({ userId, query, type, limit, includeArchived });
    }
  }

  async updateMemory(id, updates = {}) {
    try {
      const result = await this.query(
        `
          UPDATE memories
          SET
            title = COALESCE($2, title),
            content = COALESCE($3, content),
            value = COALESCE($3, value),
            importance = COALESCE($4, importance),
            confidence = COALESCE($5, confidence),
            source = COALESCE($6, source),
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          id,
          updates.title ?? null,
          updates.content ?? null,
          updates.importance ?? null,
          updates.confidence ?? null,
          updates.source ?? null
        ]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      this.warn('memory_repository_update_fallback', error);
      const memory = this.fallback.memories.get(String(id));
      if (!memory) return null;
      const updated = { ...memory, ...updates, updated_at: new Date().toISOString() };
      this.fallback.memories.set(String(id), updated);
      return updated;
    }
  }

  async archiveMemory(id) {
    try {
      const result = await this.query(
        `
          UPDATE memories
          SET is_archived = true,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      this.warn('memory_repository_archive_fallback', error);
      return this.updateMemory(id, { is_archived: true });
    }
  }

  async deleteMemory(id) {
    try {
      await this.query('DELETE FROM memories WHERE id = $1', [id]);
      return true;
    } catch (error) {
      this.warn('memory_repository_delete_fallback', error);
      return this.fallback.memories.delete(String(id));
    }
  }

  async markMemoriesUsed(ids = []) {
    if (ids.length === 0) {
      return;
    }

    try {
      await this.query(
        `
          UPDATE memories
          SET usage_count = usage_count + 1,
              last_used_at = NOW()
          WHERE id = ANY($1::bigint[])
        `,
        [ids.map(Number).filter(Boolean)]
      );
    } catch (error) {
      this.warn('memory_repository_mark_used_fallback', error);
      for (const id of ids) {
        const memory = this.fallback.memories.get(String(id));
        if (memory) {
          this.fallback.memories.set(String(id), {
            ...memory,
            usage_count: Number(memory.usage_count ?? 0) + 1,
            last_used_at: new Date().toISOString()
          });
        }
      }
    }
  }

  async saveConversationMessage({ userId, conversationId, role, content, metadata = {} }) {
    try {
      const result = await this.query(
        `
          INSERT INTO conversation_messages (user_id, conversation_id, role, content, metadata)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [String(userId), String(conversationId), role, content, metadata]
      );
      return result.rows[0];
    } catch (error) {
      this.warn('memory_repository_conversation_fallback', error);
      const id = String(this.fallback.nextMessageId++);
      const row = {
        id,
        user_id: String(userId),
        conversation_id: String(conversationId),
        role,
        content,
        metadata,
        created_at: new Date().toISOString()
      };
      const key = String(conversationId);
      const current = this.fallback.conversationMessages.get(key) ?? [];
      this.fallback.conversationMessages.set(key, [...current, row].slice(-50));
      return row;
    }
  }

  async findRecentMessages({ userId, conversationId, limit = 20 }) {
    try {
      const result = await this.query(
        `
          SELECT *
          FROM conversation_messages
          WHERE user_id = $1
            AND ($2::text IS NULL OR conversation_id = $2)
          ORDER BY created_at DESC
          LIMIT $3
        `,
        [String(userId), conversationId ? String(conversationId) : null, limit]
      );
      return result.rows.reverse();
    } catch (error) {
      this.warn('memory_repository_recent_fallback', error);
      return (this.fallback.conversationMessages.get(String(conversationId)) ?? []).slice(-limit);
    }
  }

  async findExistingMemory(memory) {
    const result = await this.query(
      `
        SELECT *
        FROM memories
        WHERE user_id = $1
          AND type = $2
          AND LOWER(title) = LOWER($3)
          AND is_archived = false
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [memory.user_id, memory.type, memory.title]
    );
    return result.rows[0] ?? null;
  }

  saveFallbackMemory(memory) {
    const existing = [...this.fallback.memories.values()].find((item) => (
      item.user_id === memory.user_id &&
      item.type === memory.type &&
      item.title.toLowerCase() === memory.title.toLowerCase() &&
      !item.is_archived
    ));

    if (existing) {
      const updated = {
        ...existing,
        ...memory,
        importance: Math.max(Number(existing.importance ?? 0), memory.importance),
        confidence: Math.max(Number(existing.confidence ?? 0), memory.confidence),
        updated_at: new Date().toISOString()
      };
      this.fallback.memories.set(String(existing.id), updated);
      return updated;
    }

    const id = String(this.fallback.nextMemoryId++);
    const now = new Date().toISOString();
    const row = {
      id,
      ...memory,
      created_at: now,
      updated_at: now,
      last_used_at: null,
      usage_count: 0,
      is_archived: false
    };
    this.fallback.memories.set(id, row);
    return row;
  }

  searchFallbackMemory({ userId, query = '', type = null, limit = 20, includeArchived = false }) {
    const cleanQuery = String(query).toLowerCase();
    const terms = tokenizeQuery(query);
    return [...this.fallback.memories.values()]
      .filter((memory) => memory.user_id === String(userId))
      .filter((memory) => includeArchived || !memory.is_archived)
      .filter((memory) => !type || memory.type === type)
      .filter((memory) => {
        if (!cleanQuery) return true;
        const haystack = [memory.type, memory.title, memory.content].join(' ').toLowerCase();
        return haystack.includes(cleanQuery) || terms.some((term) => haystack.includes(term));
      })
      .sort((a, b) => Number(b.importance) - Number(a.importance))
      .slice(0, limit);
  }

  warn(message, error) {
    this.logger?.warn(message, { error: error.message });
  }
}

function tokenizeQuery(query) {
  const stopWords = new Set([
    'quel',
    'quelle',
    'quels',
    'quelles',
    'est',
    'mon',
    'ma',
    'mes',
    'je',
    'me',
    'moi',
    'what',
    'is',
    'my',
    'the',
    'ki',
    'mwen'
  ]);

  return String(query)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3 && !stopWords.has(term));
}

function normalizeMemory(memory) {
  const type = isMemoryType(memory.type) ? memory.type : MEMORY_TYPES.CUSTOM;
  return {
    user_id: String(memory.userId ?? memory.user_id),
    type,
    title: String(memory.title || type).trim(),
    content: String(memory.content || '').trim(),
    key: `${type}:${String(memory.title || type).trim()}`,
    importance: clamp(memory.importance ?? 0.5),
    confidence: clamp(memory.confidence ?? 0.7),
    source: memory.source ?? 'user'
  };
}

function clamp(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return 0.5;
  }
  return Math.min(Math.max(number, 0), 1);
}
