import { detectLanguage } from '../services/language.js';
import { ensureCoreMemories, loadMemories, storeMemoryFromMessage } from '../memory/memory-store.js';
import { buildApprovalTask, createTask } from '../tasks/task-planner.js';
import { detectNeededTool } from '../tools/registry.js';
import { approveSuggestion, completeSuggestion, dismissSuggestion, listPendingSuggestions } from '../suggestions.js';
import { formatSuggestionsList, generateDailyCheckIn, generateProactiveSuggestions } from '../proactive-engine.js';
import { generateAssistantReply } from './openai-client.js';

export async function processUserMessage({
  message,
  userPhone,
  channel,
  language,
  dependencies = {}
}) {
  const deps = {
    ensureCoreMemories,
    loadMemories,
    storeMemoryFromMessage,
    detectNeededTool,
    createTask,
    listPendingSuggestions,
    approveSuggestion,
    dismissSuggestion,
    completeSuggestion,
    generateDailyCheckIn,
    generateProactiveSuggestions,
    formatSuggestionsList,
    generateAssistantReply,
    ...dependencies
  };

  const detectedLanguage = language || detectLanguage(message);
  const proactiveResponse = await handleProactiveCommand({
    message,
    userPhone,
    channel,
    language: detectedLanguage,
    deps
  });

  if (proactiveResponse) {
    return proactiveResponse;
  }

  await deps.ensureCoreMemories({ userPhone });
  const storedMemory = await deps.storeMemoryFromMessage({ userPhone, message });
  const memories = await deps.loadMemories({ userPhone });
  const neededTool = deps.detectNeededTool(message);

  let task = null;
  if (neededTool) {
    const taskDraft = buildApprovalTask({ userMessage: message, tool: neededTool });
    task = await deps.createTask({
      userPhone,
      channel,
      ...taskDraft
    });
  }

  const replyText = await deps.generateAssistantReply({
    userMessage: message,
    detectedLanguage,
    memories,
    neededTool,
    pendingTask: task
  });

  return {
    replyText,
    language: detectedLanguage,
    channel,
    userPhone,
    memoryStored: storedMemory,
    toolNeeded: neededTool?.name ?? null,
    taskId: task?.id ?? null,
    requiresApproval: Boolean(neededTool),
    metadata: {
      memoryCount: memories.length
    }
  };
}

export async function handleProactiveCommand({ message, userPhone, channel, language, deps }) {
  const command = parseProactiveCommand(message);
  if (!command) {
    return null;
  }

  if (command.type === 'today') {
    const replyText = await deps.generateDailyCheckIn({ userId: userPhone, persist: true });
    return buildCommandResponse({ replyText, language, channel, userPhone, command });
  }

  if (command.type === 'list') {
    const suggestions = await deps.listPendingSuggestions({ userId: userPhone });
    const replyText = deps.formatSuggestionsList(suggestions);
    return buildCommandResponse({ replyText, language, channel, userPhone, command, suggestions });
  }

  const suggestionId = command.suggestionId;
  const actions = {
    approve: deps.approveSuggestion,
    dismiss: deps.dismissSuggestion,
    complete: deps.completeSuggestion
  };
  const updated = await actions[command.type]({ userId: userPhone, suggestionId });
  const verbs = {
    approve: 'apwouve',
    dismiss: 'ignore',
    complete: 'complete'
  };
  const replyText = updated
    ? `Suggestion ${suggestionId} ${verbs[command.type]}. Mwen pap egzekite okenn aksyon ekstèn san apwobasyon klè.`
    : `Mwen pa jwenn suggestion ${suggestionId} pou kont ou.`;

  return buildCommandResponse({ replyText, language, channel, userPhone, command, suggestion: updated });
}

function buildCommandResponse({ replyText, language, channel, userPhone, command, suggestions = null, suggestion = null }) {
  return {
    replyText,
    language,
    channel,
    userPhone,
    memoryStored: null,
    toolNeeded: null,
    taskId: null,
    requiresApproval: false,
    proactiveCommand: command.type,
    metadata: {
      suggestions,
      suggestion
    }
  };
}

export function parseProactiveCommand(message = '') {
  const text = String(message).trim().toLowerCase();

  if (/^(kisa m dwe fe jodi a|kisa m dwe fè jodi a|what should i do today|que dois-je faire aujourd'hui)\??$/i.test(text)) {
    return { type: 'today' };
  }

  if (/\b(montre m suggestions yo|montre suggestions yo|show suggestions|liste suggestions|list suggestions)\b/i.test(text)) {
    return { type: 'list' };
  }

  const actionMatch = text.match(/\b(apwouve|approve|ignore|dismiss|complete|konplete)\s+suggestion\s+(\d+)\b/i);
  if (!actionMatch) {
    return null;
  }

  const action = actionMatch[1];
  const type = action === 'apwouve' || action === 'approve'
    ? 'approve'
    : action === 'complete' || action === 'konplete'
      ? 'complete'
      : 'dismiss';

  return {
    type,
    suggestionId: Number(actionMatch[2])
  };
}
