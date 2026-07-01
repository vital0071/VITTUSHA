import { MEMORY_TYPES } from './MemoryTypes.js';

const extractionRules = [
  {
    type: MEMORY_TYPES.PERSON,
    title: 'Nom',
    importance: 0.95,
    confidence: 0.9,
    patterns: [
      /\b(?:je m'appelle|mon nom est|mwen rele|non mwen se|my name is)\s+([A-ZÀ-Ÿa-zà-ÿ][^.!?\n,]*)/i
    ]
  },
  {
    type: MEMORY_TYPES.BUSINESS,
    title: 'Entreprise',
    importance: 0.9,
    confidence: 0.85,
    patterns: [
      /\b(?:je dirige|je gere|je gère|mwen dirije|i run|i manage)\s+([^.!?\n]*)/i,
      /\b(?:mon entreprise est|my company is|biznis mwen se)\s+([^.!?\n]*)/i
    ]
  },
  {
    type: MEMORY_TYPES.LANGUAGE,
    title: 'Langue',
    importance: 0.8,
    confidence: 0.85,
    patterns: [
      /\b(?:je parle|mwen pale|i speak)\s+(français|francais|créole|creole|kreyol|anglais|english|spanish|espagnol)\b/i
    ]
  },
  {
    type: MEMORY_TYPES.OBJECTIVE,
    title: 'Objectif',
    importance: 0.85,
    confidence: 0.8,
    patterns: [
      /\b(?:mon objectif est (?:de\s+|d')|objectif est (?:de\s+|d')|mwen vle\s+|my goal is to\s+|i want to\s+)([^.!?\n]*)/i
    ]
  },
  {
    type: MEMORY_TYPES.PREFERENCE,
    title: 'Preference',
    importance: 0.75,
    confidence: 0.75,
    patterns: [
      /\b(?:je préfère|je prefere|mwen prefere|i prefer)\s+([^.!?\n]*)/i
    ]
  },
  {
    type: MEMORY_TYPES.PROJECT,
    title: 'Projet',
    importance: 0.85,
    confidence: 0.8,
    patterns: [
      /\b(?:mon projet|pwojè mwen|pwoje mwen|my project)\s+(?:est|se|is)?\s*([^.!?\n]*)/i,
      /\b(?:je développe|je developpe|mwen devlope|map devlope|m ap devlope|i am developing|i develop|i'm developing)\s+([^.!?\n]*)/i,
      /\b(?:je travaille sur|mwen ap travay sou|map travay sou|m ap travay sou|i am working on|i work on|i'm working on)\s+([^.!?\n]*)/i
    ]
  }
];

export class MemoryExtractor {
  extract({ message = '', assistantReply = '' } = {}) {
    const text = [message, assistantReply].filter(Boolean).join('\n');
    const memories = [];

    for (const rule of extractionRules) {
      for (const pattern of rule.patterns) {
        const match = text.match(pattern);
        const content = sanitize(match?.[1]);
        if (!content) {
          continue;
        }

        memories.push({
          type: rule.type,
          title: inferTitle(rule.title, content),
          content,
          importance: rule.importance,
          confidence: rule.confidence,
          source: 'auto_extraction'
        });
        break;
      }
    }

    return dedupe(memories);
  }
}

function sanitize(value = '') {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/^["':-]+|["'.:-]+$/g, '')
    .trim();
}

function inferTitle(title, content) {
  if (title === 'Entreprise' || title === 'Projet') {
    return content.length <= 60 ? content : title;
  }
  return title;
}

function dedupe(memories) {
  const seen = new Set();
  return memories.filter((memory) => {
    const key = `${memory.type}:${memory.title}:${memory.content}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
