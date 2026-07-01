export class MemoryScorer {
  score(memory, { query = '', now = new Date() } = {}) {
    const importance = normalize(memory.importance, 0.5);
    const confidence = normalize(memory.confidence, 0.7);
    const usage = Math.min(Number(memory.usage_count ?? 0) / 10, 1);
    const freshness = freshnessScore(memory.updated_at ?? memory.created_at, now);
    const relevance = relevanceScore(memory, query);

    return Number((
      importance * 0.3 +
      confidence * 0.2 +
      usage * 0.15 +
      freshness * 0.15 +
      relevance * 0.2
    ).toFixed(4));
  }
}

function normalize(value, fallback) {
  const number = Number(value ?? fallback);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.min(Math.max(number, 0), 1);
}

function freshnessScore(dateValue, now) {
  if (!dateValue) {
    return 0.5;
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return 0.5;
  }

  const ageDays = Math.max((now.getTime() - date.getTime()) / 86400000, 0);
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.85;
  if (ageDays <= 30) return 0.65;
  if (ageDays <= 90) return 0.45;
  return 0.25;
}

function relevanceScore(memory, query) {
  const cleanQuery = String(query).toLowerCase().trim();
  if (!cleanQuery) {
    return 0.5;
  }

  const haystack = [
    memory.type,
    memory.title,
    memory.content,
    ...(memory.tags ?? [])
  ].join(' ').toLowerCase();

  const terms = cleanQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return 0.5;
  }

  const matches = terms.filter((term) => haystack.includes(term)).length;
  return Math.min(matches / terms.length, 1);
}
