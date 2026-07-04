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
      this.emit('project_manager_success', {
        channel: input.channel,
        userId: input.userId,
        chatId: input.chatId,
        intent: projectResponse.metadata?.intent
      });
      return projectResponse;
    }

    if (!this.fallbackHandler) {
      throw new Error('Brain fallbackHandler is required when ProjectManager does not handle the request.');
    }

    return this.fallbackHandler(input);
  }
}
