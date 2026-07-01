export class BrainPipeline {
  constructor({ contextBuilder, intentDetector, memory, projectManager, agent, logger }) {
    this.contextBuilder = contextBuilder;
    this.intentDetector = intentDetector;
    this.memory = memory;
    this.projectManager = projectManager;
    this.agent = agent;
    this.logger = logger;
  }

  async run(input) {
    this.logger.info('brain_started', {
      tenantId: input.tenantId,
      userId: input.userId,
      channel: input.channel,
      conversationId: input.conversationId
    });

    this.logger.info('message_received', {
      tenantId: input.tenantId,
      userId: input.userId,
      channel: input.channel,
      conversationId: input.conversationId
    });

    const context = await this.contextBuilder.build(input);
    const intent = this.intentDetector.detect(input.message);

    this.logger.info('intent_detected', {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
      intent
    });

    this.logger.info('router_project_manager', {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId
    });

    const projectResponse = await this.projectManager?.handleMessage({
      userId: input.userId,
      message: input.message,
      memoryContext: context.memoryContext
    });

    if (projectResponse) {
      this.logger.info('project_manager_success', {
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
        projectIntent: projectResponse.intent
      });
      this.logger.info('openai_skipped', {
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
        reason: 'project_manager_intent'
      });

      const storedMemories = await this.memory.append({
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: input.conversationId,
        message: input.message,
        answer: projectResponse.answer,
        metadata: {
          intent,
          language: context.detectedLanguage,
          projectIntent: projectResponse.intent
        }
      });

      this.logger.info('response_generated', {
        answerLength: projectResponse.answer.length,
        source: 'project_manager'
      });

      return {
        answer: projectResponse.answer,
        intent,
        agent: null,
        actions: {
          toolNeeded: null,
          taskId: null,
          requiresApproval: false,
          ...projectResponse.actions
        },
        memories: {
          loaded: context.memories,
          stored: storedMemories
        },
        metadata: {
          language: context.detectedLanguage,
          openaiError: null,
          openaiCalled: false,
          retrievedMemories: context.memoryContext?.relevantMemories ?? [],
          ...projectResponse.metadata
        }
      };
    }

    this.logger.info('agent_selected', {
      tenantId: input.tenantId,
      userId: input.userId,
      conversationId: input.conversationId,
      agent: this.agent.name
    });

    return this.agent.handle({
      ...context,
      intent
    });
  }
}
