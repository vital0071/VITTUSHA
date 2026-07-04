import { ProjectManager } from './ProjectManager.js';

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

    if (!this.fallbackHandler) {
      throw new Error('Brain fallbackHandler is required when ProjectManager does not handle the request.');
    }

    return this.fallbackHandler(input);
  }
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
