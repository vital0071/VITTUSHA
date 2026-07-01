export class BrainPipeline {
  constructor({ contextBuilder, intentDetector, agent, logger }) {
    this.contextBuilder = contextBuilder;
    this.intentDetector = intentDetector;
    this.agent = agent;
    this.logger = logger;
  }

  async run(input) {
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
