import { detectLanguage } from '../services/language.js';
import { ensureCoreMemories, extractDurableMemory, loadMemories, storeMemoryFromMessage } from '../memory/memory-store.js';
import { listRecentConversations } from '../services/conversations.js';
import { logger } from '../logger.js';
import { buildApprovalTask, createTask } from '../tasks/task-planner.js';
import { detectNeededTool } from '../tools/registry.js';
import { approveSuggestion, completeSuggestion, dismissSuggestion, listPendingSuggestions } from '../suggestions.js';
import { formatSuggestionsList, generateDailyCheckIn, generateProactiveSuggestions } from '../proactive-engine.js';
import { generateAssistantReply } from './openai-client.js';
import { Brain } from '../brain/Brain.js';
import { TaskService } from '../tasks/task-service.js';
import { formatTaskResponse, parseTaskIntent } from '../tasks/task-intents.js';
import { getTool } from '../tools/registry.js';

const runtimeEvents = [];

export const defaultBrain = new Brain({
  emit(event, payload) {
    runtimeEvents.push({ event, payload });
  },
  fallbackHandler: processUserMessageFallback
});

export function getRuntimeEvents() {
  return [...runtimeEvents];
}

export function clearRuntimeEvents() {
  runtimeEvents.length = 0;
}

export async function processUserMessage({
  message,
  userPhone,
  userId = userPhone,
  channel,
  language,
  conversationId = null,
  chatId = null,
  dependencies = {}
}) {
  if (dependencies.brain) {
    return dependencies.brain.process({
      message,
      userPhone,
      userId,
      channel,
      language,
      conversationId,
      chatId,
      dependencies
    });
  }

  return defaultBrain.process({
    message,
    userPhone,
    userId,
    channel,
    language,
    conversationId,
    chatId,
    dependencies
  });
}

async function processUserMessageFallback({
  message,
  userPhone,
  userId = userPhone,
  channel,
  language,
  conversationId = null,
  chatId = null,
  dependencies = {}
}) {
  const deps = {
    ensureCoreMemories,
    loadMemories,
    storeMemoryFromMessage,
    extractDurableMemory,
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
    listRecentConversations,
    logger,
    taskService: new TaskService(),
    parseTaskIntent,
    formatTaskResponse,
    getTool,
    ...dependencies
  };

  const detectedLanguage = language || detectLanguage(message);
  deps.logger.info('brain_started', { channel, userId, chatId });
  deps.logger.info('canonical_user_resolved', { channel, userId, userPhone, chatId });
  const taskResponse = await handleTaskIntent({
    message,
    userPhone,
    userId,
    channel,
    language: detectedLanguage,
    conversationId,
    chatId,
    deps
  });

  if (taskResponse) {
    return taskResponse;
  }

  const proactiveResponse = await handleProactiveCommand({
    message,
    userPhone,
    userId,
    channel,
    language: detectedLanguage,
    conversationId,
    chatId,
    deps
  });

  if (proactiveResponse) {
    return proactiveResponse;
  }

  await deps.ensureCoreMemories({ userPhone });
  deps.logger.info('memory_extraction_started', { channel, userId, userPhone });
  const memoryExtraction = deps.extractDurableMemory(message);
  const storedMemory = memoryExtraction.memory
    ? await deps.storeMemoryFromMessage({ userPhone, message })
    : null;
  deps.logger.info('memory_extraction_completed', {
    channel,
    userId,
    userPhone,
    memoryCount: storedMemory ? 1 : 0
  });
  deps.logger.info(storedMemory ? 'memory_persisted' : 'memory_rejected', {
    channel,
    userId,
    userPhone,
    reason: storedMemory ? 'durable_fact' : memoryExtraction.reason
  });
  deps.logger.info('memory_lookup_started', { channel, userId, userPhone });
  const memories = await deps.loadMemories({ userPhone });
  deps.logger.info('memory_lookup_completed', { channel, userId, userPhone, memoryCount: memories.length });
  const recentConversations = await deps.listRecentConversations({
    userId: userPhone,
    excludeId: conversationId,
    limit: 10
  }).catch((error) => {
    deps.logger.warn('recent_conversation_lookup_failed', { channel, userId, userPhone, error: error.message });
    return [];
  });
  deps.logger.info('prompt_context_built', {
    channel,
    userId,
    memoryCount: memories.length,
    recentMessageCount: recentConversations.length,
    projectContextCount: 0
  });
  deps.logger.info('core_identity_injected', { channel, userId });
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

  deps.logger.info('agent_selected', { channel, userId, agent: 'ExecutiveAgent' });
  deps.logger.info('openai_called', { channel, userId });
  const replyText = await deps.generateAssistantReply({
    userMessage: message,
    detectedLanguage,
    memories,
    neededTool,
    pendingTask: task,
    recentConversations,
    userProfile: {
      displayName: null,
      vittushaUserId: userId
    },
    projectContext: []
  });
  deps.logger.info('response_generated', { channel, userId });

  return {
    replyText,
    language: detectedLanguage,
    channel,
    userPhone,
    userId,
    memoryStored: storedMemory,
    toolNeeded: neededTool?.name ?? null,
    taskId: task?.id ?? null,
    requiresApproval: Boolean(neededTool),
    metadata: {
      memoryCount: memories.length,
      recentMessageCount: recentConversations.length,
      conversationId,
      chatId
    }
  };
}

async function handleTaskIntent({ message, userPhone, userId, channel, language, conversationId, chatId, deps }) {
  const intent = deps.parseTaskIntent(message);
  if (!intent) {
    return null;
  }

  const tenantId = userPhone;
  const taskUserId = userId ?? userPhone;
  const tool = deps.getTool(intent.type);
  let task = null;
  let tasks = [];

  if (intent.type === 'create_task') {
    task = await deps.taskService.createTask({
      tenantId,
      userId: taskUserId,
      title: intent.title
    });
  } else if (intent.type === 'list_tasks') {
    tasks = await deps.taskService.listTasks({
      tenantId,
      userId: taskUserId
    });
  } else if (intent.type === 'complete_task') {
    task = await deps.taskService.completeTask({
      tenantId,
      userId: taskUserId,
      title: intent.title
    });
  }

  const replyText = deps.formatTaskResponse({
    action: intent.type,
    task,
    tasks,
    language
  });

  return {
    replyText,
    language,
    channel,
    userPhone,
    userId: taskUserId,
    memoryStored: null,
    toolNeeded: tool?.name ?? intent.type,
    taskId: task?.id ?? null,
    requiresApproval: false,
    selectedAgent: 'ExecutiveAgent',
    metadata: {
      conversationId,
      chatId,
      taskIntent: intent,
      task,
      tasks
    }
  };
}

async function handleProactiveCommand({ message, userPhone, userId, channel, language, conversationId, chatId, deps }) {
  const command = parseProactiveCommand(message);
  if (!command) {
    return null;
  }

  if (command.type === 'today') {
    const replyText = await deps.generateDailyCheckIn({ userId: userPhone, persist: true });
    return buildCommandResponse({ replyText, language, channel, userPhone, userId, conversationId, chatId, command });
  }

  if (command.type === 'list') {
    const suggestions = await deps.listPendingSuggestions({ userId: userPhone });
    const replyText = deps.formatSuggestionsList(suggestions);
    return buildCommandResponse({ replyText, language, channel, userPhone, userId, conversationId, chatId, command, suggestions });
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

  return buildCommandResponse({ replyText, language, channel, userPhone, userId, conversationId, chatId, command, suggestion: updated });
}

function buildCommandResponse({ replyText, language, channel, userPhone, userId, conversationId, chatId, command, suggestions = null, suggestion = null }) {
  return {
    replyText,
    language,
    channel,
    userPhone,
    userId,
    memoryStored: null,
    toolNeeded: null,
    taskId: null,
    requiresApproval: false,
    proactiveCommand: command.type,
    metadata: {
      conversationId,
      chatId,
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
