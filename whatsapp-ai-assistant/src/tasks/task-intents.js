import { SUPPORTED_LANGUAGES } from '../services/language.js';

export function parseTaskIntent(message = '') {
  const text = String(message).trim();
  const normalized = normalize(text);

  const createPatterns = [
    /^(?:ajoute|mete)\s+travay(?:\s+sa)?(?:\s+pou\s+mwen)?\s*:?\s+(.+)$/iu,
    /^kreye\s+(?:yon\s+)?travay\s+(?:pou\s+)?(.+)$/iu,
    /^cree\s+(?:une\s+)?tache\s+pour\s+(.+)$/iu,
    /^cree\s+(?:une\s+)?tache\s*:?\s+(.+)$/iu,
    /^create\s+(?:a\s+)?task\s+(?:to|for)\s+(.+)$/iu,
    /^remind\s+me\s+to\s+(.+)$/iu
  ];

  for (const pattern of createPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return {
        type: 'create_task',
        title: restoreOriginalSegment(text, match[1])
      };
    }
  }

  if (/^(?:ki\s+travay\s+mwen\s+genyen|montre\s+m\s+travay\s+mwen\s+yo|lis\s+travay\s+mwen\s+yo|liste\s+mes\s+taches|what\s+are\s+my\s+tasks)\??$/iu.test(normalized)) {
    return { type: 'list_tasks' };
  }

  const completePatterns = [
    /^make\s+travay\s+(.+?)\s+lan\s+fini$/iu,
    /^marque\s+la\s+tache\s+(.+?)\s+comme\s+terminee$/iu,
    /^complete\s+(?:the\s+)?(.+?)\s+task$/iu,
    /^complete\s+task\s+(.+)$/iu
  ];

  for (const pattern of completePatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return {
        type: 'complete_task',
        title: restoreOriginalSegment(text, match[1])
      };
    }
  }

  return null;
}

export function formatTaskResponse({ action, task = null, tasks = [], language = 'ht' }) {
  const code = SUPPORTED_LANGUAGES[language] ? language : 'ht';

  if (action === 'create_task') {
    return translate(code, {
      ht: `Travay la ajoute: ${task.title}.`,
      fr: `Tâche créée : ${task.title}.`,
      en: `Task created: ${task.title}.`
    });
  }

  if (action === 'complete_task') {
    if (!task) {
      return translate(code, {
        ht: 'Mwen pa jwenn travay sa nan lis ou.',
        fr: "Je n'ai pas trouvé cette tâche dans votre liste.",
        en: 'I could not find that task in your list.'
      });
    }

    return translate(code, {
      ht: `Travay fini: ${task.title}.`,
      fr: `Tâche terminée : ${task.title}.`,
      en: `Task completed: ${task.title}.`
    });
  }

  const openTasks = tasks.filter((item) => item.status !== 'completed');
  if (openTasks.length === 0) {
    return translate(code, {
      ht: 'Ou pa gen travay ouvè.',
      fr: "Vous n'avez aucune tâche ouverte.",
      en: 'You have no open tasks.'
    });
  }

  const list = openTasks.map((item, index) => `${index + 1}. ${item.title}`).join('\n');
  return translate(code, {
    ht: `Men travay ou yo:\n${list}`,
    fr: `Voici vos tâches :\n${list}`,
    en: `Here are your tasks:\n${list}`
  });
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function restoreOriginalSegment(originalText, normalizedSegment) {
  const normalizedOriginal = normalize(originalText);
  const start = normalizedOriginal.indexOf(normalizedSegment);
  if (start === -1) {
    return normalizedSegment.trim();
  }
  return originalText.slice(start, start + normalizedSegment.length).trim();
}

function translate(_language, messages) {
  return messages[_language] ?? messages.ht;
}
