import { MEMORY_TYPES } from './MemoryTypes.js';

export class MemoryContextBuilder {
  build({ userId, detectedLanguage, relevantMemories = [], recentMessages = [], currentConversation = {} }) {
    const groups = groupByType(relevantMemories);
    const context = {
      currentUser: {
        userId
      },
      relevantMemories,
      recentMessages,
      preferences: groups[MEMORY_TYPES.PREFERENCE] ?? [],
      projects: groups[MEMORY_TYPES.PROJECT] ?? [],
      goals: groups[MEMORY_TYPES.OBJECTIVE] ?? [],
      business: groups[MEMORY_TYPES.BUSINESS] ?? [],
      language: groups[MEMORY_TYPES.LANGUAGE] ?? [],
      currentConversation: {
        detectedLanguage,
        ...currentConversation
      }
    };

    return {
      ...context,
      promptText: renderContext(context)
    };
  }
}

function groupByType(memories) {
  return memories.reduce((acc, memory) => {
    acc[memory.type] ??= [];
    acc[memory.type].push(memory);
    return acc;
  }, {});
}

function renderContext(context) {
  return [
    section('Current User', [`User ID: ${context.currentUser.userId}`]),
    section('Relevant Memories', context.relevantMemories.map(formatMemory)),
    section('Recent Messages', context.recentMessages.map((message) => `${message.role}: ${message.content}`)),
    section('Preferences', context.preferences.map(formatMemory)),
    section('Projects', context.projects.map(formatMemory)),
    section('Goals', context.goals.map(formatMemory)),
    section('Business', context.business.map(formatMemory)),
    section('Language', context.language.map(formatMemory)),
    section('Current Conversation', [
      `Detected language: ${context.currentConversation.detectedLanguage ?? 'unknown'}`
    ])
  ].join('\n\n');
}

function section(title, lines) {
  const content = lines.filter(Boolean);
  return `${title}:\n${content.length ? content.map((line) => `- ${line}`).join('\n') : '- None'}`;
}

function formatMemory(memory) {
  return `[${memory.type}] ${memory.title}: ${memory.content}`;
}
