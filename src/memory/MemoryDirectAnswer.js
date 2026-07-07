import { MEMORY_TYPES } from './MemoryTypes.js';

const directAnswerRules = [
  {
    type: MEMORY_TYPES.PROJECT,
    pattern: /(?:\b(quel|quelle|ki|what|sur)\b.*\b(projet|pwoj[eè]|project|développe|developpe|devlope|develop|travaille|travay|working)\b|\bque\s+sais-tu\b.*\bprojet\b)/i,
    answer(memory, { language }) {
      return language === 'ht'
        ? `W ap devlope ${memory.content}.`
        : `Vous développez ${memory.content}.`;
    }
  },
  {
    type: MEMORY_TYPES.PERSON,
    pattern: /\b(comment|kijan|what)\b.*\b(appelle|rele|name|nom)\b/i,
    answer(memory, { language }) {
      return language === 'ht'
        ? `Ou rele ${memory.content}.`
        : `Bonjour ${memory.content}.`;
    }
  },
  {
    type: MEMORY_TYPES.BUSINESS,
    pattern: /\b(quel|quelle|ki|what)\b.*\b(entreprise|business|company|dirige|manage)\b/i,
    answer(memory, { language }) {
      return language === 'ht'
        ? `Ou dirije ${memory.content}.`
        : `Vous dirigez ${memory.content}.`;
    }
  },
  {
    type: MEMORY_TYPES.LANGUAGE,
    pattern: /\b(quelle|ki|what)\b.*\b(langue|language|pale|parle)\b/i,
    answer(memory, { language }) {
      return language === 'ht'
        ? `Ou pale ${memory.content}.`
        : `Vous parlez ${memory.content}.`;
    }
  },
  {
    type: MEMORY_TYPES.OBJECTIVE,
    pattern: /\b(quel|quelle|ki|what)\b.*\b(objectif|goal|objektif)\b/i,
    answer(memory, { language }) {
      return language === 'ht'
        ? `Objektif ou se ${memory.content}.`
        : `Votre objectif est ${memory.content}.`;
    }
  },
  {
    type: MEMORY_TYPES.PREFERENCE,
    pattern: /\b(quelle|ki|what)\b.*\b(préférence|preference|preferans|prefer)\b/i,
    answer(memory, { language }) {
      return language === 'ht'
        ? `Preferans ou se ${memory.content}.`
        : `Votre préférence est ${memory.content}.`;
    }
  }
];

export function findDirectMemoryAnswer({ message = '', memoryContext = null, detectedLanguage = null } = {}) {
  const memories = memoryContext?.relevantMemories ?? [];
  const language = detectedLanguage || memoryContext?.currentConversation?.detectedLanguage || inferLanguage(message);
  let matchedQuestionType = null;

  for (const rule of directAnswerRules) {
    if (!rule.pattern.test(message)) {
      continue;
    }

    matchedQuestionType = rule.type;
    const memory = selectBestMemoryForQuestion({ memories, type: rule.type, message });

    if (memory?.content) {
      return {
        answer: rule.answer(memory, { language }),
        memory,
        reason: 'direct_memory_match',
        matchedQuestionType,
        language
      };
    }

    return {
      answer: null,
      memory: null,
      reason: 'no_memory_for_direct_question',
      matchedQuestionType,
      language
    };
  }

  return {
    answer: null,
    memory: null,
    reason: 'no_direct_question_match',
    matchedQuestionType,
    language
  };
}

function selectBestMemoryForQuestion({ memories = [], type, message = '' }) {
  const normalizedMessage = normalizeText(message);
  return memories
    .filter((item) => item.type === type && String(item.content ?? '').trim())
    .map((memory) => ({
      memory,
      nameMentioned: memoryNameMentioned(memory, normalizedMessage) ? 1 : 0
    }))
    .sort((a, b) => b.nameMentioned - a.nameMentioned || compareMemories(a.memory, b.memory))
    .map((item) => item.memory)[0] ?? null;
}

function memoryNameMentioned(memory, normalizedMessage) {
  const candidates = [memory.content, memory.title]
    .map(normalizeText)
    .filter((value) => value.length > 0);
  return candidates.some((candidate) => normalizedMessage.includes(candidate));
}

function compareMemories(a, b) {
  return Number(b.score ?? 0) - Number(a.score ?? 0)
    || Number(b.importance ?? 0) - Number(a.importance ?? 0)
    || Number(b.confidence ?? 0) - Number(a.confidence ?? 0)
    || String(b.updated_at ?? b.created_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? ''))
    || String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

function inferLanguage(message = '') {
  return /\b(ki|pwoj[eè]|pwoje|map|m ap|devlope|travay|mwen)\b/i.test(message)
    ? 'ht'
    : 'fr';
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
