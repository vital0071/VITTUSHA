import { generateAssistantReply } from '../ai-core/openai-client.js';

const TEMPORARY_FAILURE_MESSAGE = 'Je rencontre une difficulté technique temporaire. Réessaie dans quelques instants.';

export class ResponseGenerator {
  constructor({ logger, generateReply = generateAssistantReply } = {}) {
    this.logger = logger;
    this.generateReply = generateReply;
  }

  async generate({ message, detectedLanguage, memories, neededTool, pendingTask }) {
    try {
      this.logger.info('openai_called', {
        language: detectedLanguage,
        memoryCount: memories.length,
        toolNeeded: neededTool?.name ?? null,
        taskId: pendingTask?.id ?? null
      });

      const answer = await this.generateReply({
        userMessage: message,
        detectedLanguage,
        memories,
        neededTool,
        pendingTask
      });

      this.logger.info('response_generated', {
        answerLength: answer.length
      });

      return { answer, error: null };
    } catch (error) {
      this.logger.error('openai_failed', {
        error: error.message
      });

      return {
        answer: TEMPORARY_FAILURE_MESSAGE,
        error
      };
    }
  }
}
