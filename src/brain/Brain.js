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
    this.agent = dependencies.agent ?? new ExecutiveAgent({
      memory: this.memory,
      toolRegistry: this.toolRegistry,
      responseGenerator: this.responseGenerator,
      logger: this.logger
    });
    this.pipeline = dependencies.pipeline ?? new BrainPipeline({
      contextBuilder: dependencies.contextBuilder ?? new ContextBuilder({
        memory: this.memory,
        logger: this.logger
      }),
      intentDetector: dependencies.intentDetector ?? new IntentDetector(),
      memory: this.memory,
      projectManager: this.projectManager,
      agent: this.agent,
      logger: this.logger
    });
  }

  async processMessage({
    tenantId = 'default',
    userId,
    channel,
    conversationId,
    message,
    metadata = {}
  }) {
    const result = await this.pipeline.run({
      tenantId,
      userId,
      channel,
      conversationId,
      message,
      metadata
    });

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
