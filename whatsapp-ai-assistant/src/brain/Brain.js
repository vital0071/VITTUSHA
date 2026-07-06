import { ProjectManager } from './ProjectManager.js';
import { TaskService } from '../tasks/task-service.js';
import { formatTaskResponse, parseTaskIntent } from '../tasks/task-intents.js';
import { getTool } from '../tools/registry.js';

export class Brain {
  constructor({
    projectManager = new ProjectManager(),
    fallbackHandler,
    emit = () => {}
  } = {}) {
    this.projectManager = projectManager;
    this.fallbackHandler = fallbackHandler;
    this.emit = emit;
  }

  async process(input) {
    const projectResponse = await this.projectManager.handle(input);

    if (projectResponse?.handled) {
      const normalizedResponse = normalizeHandledResponse(projectResponse);
      this.emit('project_manager_success', {
        channel: input.channel,
        userId: input.userId,
        chatId: input.chatId,
        intent: normalizedResponse.metadata?.intent
      });
      return normalizedResponse;
    }

    const taskResponse = await handleTaskIntent(input);
    if (taskResponse) {
      this.emit('task_manager_success', {
        channel: input.channel,
        userId: taskResponse.userId,
        chatId: input.chatId,
        intent: taskResponse.metadata?.taskIntent?.type
      });
      return taskResponse;
    }

    if (!this.fallbackHandler) {
      throw new Error('Brain fallbackHandler is required when ProjectManager does not handle the request.');
    }

    return this.fallbackHandler(input);
  }
}

async function handleTaskIntent(input) {
  const dependencies = input.dependencies ?? {};
  const parser = dependencies.parseTaskIntent ?? parseTaskIntent;
  const intent = parser(input.message);
  if (!intent) {
    return null;
  }

  const taskService = dependencies.taskService ?? new TaskService();
  const formatter = dependencies.formatTaskResponse ?? formatTaskResponse;
  const toolResolver = dependencies.getTool ?? getTool;
  const tenantId = input.userPhone ?? input.chatId ?? input.userId;
  const userId = input.userId ?? tenantId;
  const tool = toolResolver(intent.type);
  let task = null;
  let tasks = [];

  if (intent.type === 'create_task') {
    task = await taskService.createTask({
      tenantId,
      userId,
      title: intent.title
    });
  } else if (intent.type === 'list_tasks') {
    tasks = await taskService.listTasks({ tenantId, userId });
  } else if (intent.type === 'complete_task') {
    task = await taskService.completeTask({
      tenantId,
      userId,
      title: intent.title
    });
  } else {
    return null;
  }

  const replyText = formatter({
    action: intent.type,
    task,
    tasks,
    language: input.language
  });

  return normalizeHandledResponse({
    handled: true,
    replyText,
    finalReply: replyText,
    openaiCalled: false,
    language: input.language,
    channel: input.channel,
    userPhone: input.userPhone,
    userId,
    memoryStored: null,
    toolNeeded: tool?.name ?? intent.type,
    taskId: task?.id ?? null,
    requiresApproval: false,
    selectedAgent: 'ExecutiveAgent',
    metadata: {
      conversationId: input.conversationId ?? null,
      chatId: input.chatId ?? null,
      taskIntent: intent,
      task,
      tasks
    }
  });
}

function normalizeHandledResponse(response) {
  const reply = response.replyText ?? response.response ?? response.text ?? response.message;
  if (typeof reply !== 'string' || reply.length === 0) {
    throw new Error('ProjectManager handled the request without returning a string reply.');
  }

  return {
    ...response,
    replyText: reply,
    response: reply,
    text: reply,
    message: reply,
    finalReply: response.finalReply ?? reply,
    openaiCalled: response.openaiCalled ?? false
  };
}
