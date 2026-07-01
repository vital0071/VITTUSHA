import { buildApprovalTask, createTask } from '../tasks/task-planner.js';
import {
  approveSuggestion,
  completeSuggestion,
  dismissSuggestion,
  listPendingSuggestions
} from '../suggestions.js';
import {
  formatSuggestionsList,
  generateDailyCheckIn,
  generateProactiveSuggestions
} from '../proactive-engine.js';
import { handleProactiveCommand } from '../ai-core/agent.js';

export class ExecutiveAgent {
  constructor({
    memory,
    toolRegistry,
    responseGenerator,
    logger,
    createApprovalTask = createTask,
    proactive = {}
  }) {
    this.name = 'ExecutiveAgent';
    this.memory = memory;
    this.toolRegistry = toolRegistry;
    this.responseGenerator = responseGenerator;
    this.logger = logger;
    this.createApprovalTask = createApprovalTask;
    this.proactive = {
      listPendingSuggestions,
      approveSuggestion,
      dismissSuggestion,
      completeSuggestion,
      generateDailyCheckIn,
      generateProactiveSuggestions,
      formatSuggestionsList,
      ...proactive
    };
  }

  async handle(context) {
    const proactiveResponse = await handleProactiveCommand({
      message: context.message,
      userPhone: context.userId,
      channel: context.channel,
      language: context.detectedLanguage,
      deps: this.proactive
    });

    if (proactiveResponse) {
      await this.memory.append({
        tenantId: context.tenantId,
        userId: context.userId,
        conversationId: context.conversationId,
        message: context.message,
        answer: proactiveResponse.replyText,
        metadata: {
          intent: context.intent,
          agent: this.name,
          language: context.detectedLanguage,
          proactiveCommand: proactiveResponse.proactiveCommand
        }
      });

      this.logger.info('response_generated', {
        answerLength: proactiveResponse.replyText.length,
        proactiveCommand: proactiveResponse.proactiveCommand
      });

      return {
        answer: proactiveResponse.replyText,
        intent: context.intent,
        agent: this.name,
        actions: {
          toolNeeded: null,
          taskId: null,
          requiresApproval: false
        },
        memories: {
          loaded: context.memories,
          stored: null
        },
        proactiveCommand: proactiveResponse.proactiveCommand,
        metadata: {
          language: context.detectedLanguage,
          openaiError: null,
          ...proactiveResponse.metadata
        }
      };
    }

    const neededTool = this.toolRegistry.detectNeededTool(context.message);
    let task = null;

    if (neededTool) {
      const taskDraft = buildApprovalTask({
        userMessage: context.message,
        tool: neededTool
      });

      task = await this.createApprovalTask({
        userPhone: context.userId,
        channel: context.channel,
        ...taskDraft
      });
    }

    const response = await this.responseGenerator.generate({
      message: context.message,
      detectedLanguage: context.detectedLanguage,
      memories: context.memories,
      memoryContext: context.memoryContext,
      neededTool,
      pendingTask: task
    });

    const storedMemories = await this.memory.append({
      tenantId: context.tenantId,
      userId: context.userId,
      conversationId: context.conversationId,
      message: context.message,
      answer: response.answer,
      metadata: {
        intent: context.intent,
        agent: this.name,
        language: context.detectedLanguage,
        toolNeeded: neededTool?.name ?? null,
        taskId: task?.id ?? null
      }
    });

    return {
      answer: response.answer,
      intent: context.intent,
      agent: this.name,
      actions: {
        toolNeeded: neededTool?.name ?? null,
        taskId: task?.id ?? null,
        requiresApproval: Boolean(neededTool)
      },
      memories: {
        loaded: context.memories,
        stored: storedMemories
      },
      metadata: {
        language: context.detectedLanguage,
        openaiError: response.error?.message ?? null,
        openaiCalled: response.openaiCalled ?? false,
        responseSource: response.source ?? 'unknown',
        directMemoryAnswer: response.directMemoryAnswer ?? null,
        retrievedMemories: context.memoryContext?.relevantMemories ?? []
      }
    };
  }
}
