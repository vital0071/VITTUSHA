import { ExecutiveAgent } from '../agents/ExecutiveAgent.js';
import { ConversationMemory } from '../memory/ConversationMemory.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { logger as defaultLogger } from '../shared/logger.js';
import { ContextBuilder } from './ContextBuilder.js';
import { IntentDetector } from './IntentDetector.js';
import { BrainPipeline } from './BrainPipeline.js';
import { ResponseGenerator } from './ResponseGenerator.js';
import { ProjectManager } from '../projects/ProjectManager.js';

export class Brain {
  constructor(dependencies = {}) {
    this.logger = dependencies.logger ?? defaultLogger;
    this.memory = dependencies.memory ?? new ConversationMemory({ logger: this.logger });
    this.projectManager = dependencies.projectManager ?? new ProjectManager({ logger: this.logger });
    this.toolRegistry = dependencies.toolRegistry ?? new ToolRegistry();
    this.responseGenerator = dependencies.responseGenerator ?? new ResponseGenerator({
      logger: this.logger,
      generateReply: dependencies.generateReply
    });
    this.contextBuilder = dependencies.contextBuilder ?? new ContextBuilder({
      memory: this.memory,
      logger: this.logger
    });
    this.intentDetector = dependencies.intentDetector ?? new IntentDetector();
    this.agent = dependencies.agent ?? null;
    this.pipeline = dependencies.pipeline ?? null;
  }

  async processMessage({
    tenantId = 'default',
    userId,
    channel,
    conversationId,
    message,
    metadata = {}
  }) {
    this.logger.info('brain_started', {
      tenantId,
      userId,
      channel,
      conversationId
    });

    this.logger.info('message_received', {
      tenantId,
      userId,
      channel,
      conversationId
    });

    const intent = this.intentDetector.detect(message);
    this.logger.info('intent_detected', {
      tenantId,
      userId,
      conversationId,
      intent
    });

    this.logger.info('router_project_manager', {
      tenantId,
      userId,
      conversationId
    });

    const projectManagerResult = await this.projectManager?.handleMessage({
      userId,
      message,
      memoryContext: null
    });

    if (projectManagerResult) {
      this.logger.info('project_manager_success', {
        tenantId,
        userId,
        conversationId,
        projectIntent: projectManagerResult.intent
      });
      this.logger.info('openai_skipped', {
        tenantId,
        userId,
        conversationId,
        reason: 'project_manager_intent'
      });
      this.logger.info('project_manager_terminal', {
        tenantId,
        userId,
        conversationId,
        projectIntent: projectManagerResult.intent
      });

      return this.formatResult({
        answer: projectManagerResult.answer,
        intent,
        agent: null,
        actions: {
          toolNeeded: null,
          taskId: null,
          requiresApproval: false,
          ...projectManagerResult.actions
        },
        memories: {
          loaded: [],
          stored: null
        },
        metadata: {
          openaiCalled: false,
          ...projectManagerResult.metadata
        }
      });
    }

    const result = await this.getPipeline().run({
      tenantId,
      userId,
      channel,
      conversationId,
      message,
      metadata
    });

    return this.formatResult(result);
  }

  getAgent() {
    if (!this.agent) {
      this.agent = new ExecutiveAgent({
        memory: this.memory,
        toolRegistry: this.toolRegistry,
        responseGenerator: this.responseGenerator,
        logger: this.logger
      });
    }
    return this.agent;
  }

  getPipeline() {
    if (!this.pipeline) {
      this.pipeline = new BrainPipeline({
        contextBuilder: this.contextBuilder,
        intentDetector: this.intentDetector,
        memory: this.memory,
        projectManager: this.projectManager,
        agent: this.getAgent(),
        logger: this.logger
      });
    }
    return this.pipeline;
  }

  formatResult(result) {
    return {
      reply: result.answer,
      answer: result.answer,
      intent: result.intent,
      agent: result.agent,
      actions: result.actions,
      memories: result.memories,
      proactiveCommand: result.proactiveCommand,
      logs: [
        'message_received',
        'memory_loaded',
        'intent_detected',
        'agent_selected',
        'openai_called',
        'response_generated'
      ],
      metadata: result.metadata
    };
  }
}

export const brain = new Brain();
