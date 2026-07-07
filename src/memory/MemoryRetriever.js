import { MEMORY_TYPES } from './MemoryTypes.js';
import { MemoryScorer } from './MemoryScorer.js';

export class MemoryRetriever {
  constructor({ repository, scorer = new MemoryScorer(), logger } = {}) {
    this.repository = repository;
    this.scorer = scorer;
    this.logger = logger;
  }

  async findRelevantMemories({ userId, message = '', limit = 12 }) {
    this.logger?.info('memory_lookup', {
      userId,
      query: message,
      limit
    });

    const memories = await this.repository.searchMemory({
      userId,
      query: message,
      limit: Math.max(limit * 3, 20)
    });

    const preferredTypes = await this.loadAlwaysRelevantTypes({ userId });
    const combined = dedupeById([...memories, ...preferredTypes]);
    const scored = combined
      .map((memory) => ({
        ...memory,
        score: this.scorer.score(memory, { query: message })
      }))
      .sort(compareMemories)
      .slice(0, limit);

    await this.repository.markMemoriesUsed(scored.map((memory) => memory.id));

    this.logger?.info('memories_retrieved', {
      userId,
      query: message,
      memoryCount: scored.length,
      memories: scored.map((memory) => ({
        id: memory.id,
        type: memory.type,
        title: memory.title,
        score: memory.score
      }))
    });

    this.logger?.info('memory_retrieved', {
      userId,
      memoryCount: scored.length
    });

    return scored;
  }

  async loadAlwaysRelevantTypes({ userId }) {
    const types = [
      MEMORY_TYPES.PERSON,
      MEMORY_TYPES.PREFERENCE,
      MEMORY_TYPES.PROJECT,
      MEMORY_TYPES.OBJECTIVE,
      MEMORY_TYPES.BUSINESS,
      MEMORY_TYPES.LANGUAGE
    ];
    const groups = await Promise.all(types.map((type) => (
      this.repository.searchMemory({ userId, type, limit: 5 })
    )));
    return groups.flat();
  }
}

function dedupeById(memories) {
  const seen = new Set();
  return memories.filter((memory) => {
    const id = String(memory.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function compareMemories(a, b) {
  return Number(b.score ?? 0) - Number(a.score ?? 0)
    || Number(b.importance ?? 0) - Number(a.importance ?? 0)
    || Number(b.confidence ?? 0) - Number(a.confidence ?? 0)
    || String(b.updated_at ?? b.created_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? ''))
    || String(a.id ?? '').localeCompare(String(b.id ?? ''));
}
