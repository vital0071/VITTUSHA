import { generateAssistantReply } from '../ai-core/openai-client.js';
import { findDirectMemoryAnswer } from '../memory/MemoryDirectAnswer.js';

const TEMPORARY_FAILURE_MESSAGE = 'Je rencontre une difficulté technique temporaire. Réessaie dans quelques instants.';

export class ResponseGenerator {
  constructor({ logger, generateReply = generateAssistantReply } = {}) {
    this.logger = logger;
    this.generateReply = generateReply;
  }

  async generate({ message, detectedLanguage, memories, memoryContext, neededTool, pendingTask }) {
    try {
      this.logger.info('direct_memory_answer_attempt', {
        memoryCount: memoryContext?.relevantMemories?.length ?? 0,
        detectedLanguage,
        userMessage: message
      });

      const directMemoryAnswer = findDirectMemoryAnswer({
        message,
        memoryContext,
        detectedLanguage
      });
      if (directMemoryAnswer.answer) {
        this.logger.info('memory_direct_answer_match', {
          memoryId: directMemoryAnswer.memory.id,
          type: directMemoryAnswer.memory.type,
          title: directMemoryAnswer.memory.title,
          language: directMemoryAnswer.language
        });
        this.logger.info('direct_memory_answer_success', {
          memoryId: directMemoryAnswer.memory.id,
          type: directMemoryAnswer.memory.type,
          title: directMemoryAnswer.memory.title,
          language: directMemoryAnswer.language,
          reason: directMemoryAnswer.reason
        });
        this.logger.info('memory_used', {
          memoryId: directMemoryAnswer.memory.id,
          type: directMemoryAnswer.memory.type,
          title: directMemoryAnswer.memory.title,
          reason: directMemoryAnswer.reason
        });

        this.logger.info('response_generated', {
          answerLength: directMemoryAnswer.answer.length,
          source: 'memory'
        });

        return {
          answer: directMemoryAnswer.answer,
          error: null,
          source: 'memory',
          openaiCalled: false,
          directMemoryAnswer: {
            matched: true,
            reason: directMemoryAnswer.reason,
            matchedQuestionType: directMemoryAnswer.matchedQuestionType,
            memory: directMemoryAnswer.memory,
            language: directMemoryAnswer.language,
            answer: directMemoryAnswer.answer
          }
        };
      }

      this.logger.info('memory_direct_answer_failed_reason', {
        reason: directMemoryAnswer.reason,
        matchedQuestionType: directMemoryAnswer.matchedQuestionType,
        relevantMemoryCount: memoryContext?.relevantMemories?.length ?? 0
      });
      this.logger.info('direct_memory_answer_failure', {
        reason: directMemoryAnswer.reason,
        matchedQuestionType: directMemoryAnswer.matchedQuestionType,
        relevantMemoryCount: memoryContext?.relevantMemories?.length ?? 0
      });

      this.logger.info('context_injected', {
        memoryCount: memoryContext?.relevantMemories?.length ?? memories.length,
        recentMessageCount: memoryContext?.recentMessages?.length ?? 0,
        hasPromptText: Boolean(memoryContext?.promptText)
      });

      this.logger.info('openai_called', {
        language: detectedLanguage,
        memoryCount: memories.length,
        toolNeeded: neededTool?.name ?? null,
        taskId: pendingTask?.id ?? null,
        reason: directMemoryAnswer.reason,
        matchedQuestionType: directMemoryAnswer.matchedQuestionType
      });

      const answer = await this.generateReply({
        userMessage: message,
        detectedLanguage,
        memories,
        memoryContext,
        neededTool,
        pendingTask
      });

      this.logger.info('response_generated', {
        answerLength: answer.length
      });

      return {
        answer,
        error: null,
        source: 'openai',
        openaiCalled: true,
        directMemoryAnswer: {
          matched: false,
          reason: directMemoryAnswer.reason,
          matchedQuestionType: directMemoryAnswer.matchedQuestionType,
          relevantMemoryCount: memoryContext?.relevantMemories?.length ?? 0
        }
      };
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
