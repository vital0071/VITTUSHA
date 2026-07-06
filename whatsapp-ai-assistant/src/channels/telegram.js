import { config, isApprovedTelegramChat } from '../config.js';
import { logger } from '../logger.js';
import { processUserMessage } from '../ai-core/agent.js';
import { createIncomingConversation, markConversationFailed, markConversationReplied } from '../services/conversations.js';
import { detectLanguage } from '../services/language.js';

export function extractTelegramMessage(payload = {}) {
  const sourceMessage = payload.message ?? payload.edited_message ?? null;
  if (!sourceMessage?.text || !sourceMessage.chat?.id) {
    return null;
  }

  const from = sourceMessage.from ?? {};
  const profileName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null;

  return {
    telegramUpdateId: payload.update_id,
    telegramMessageId: sourceMessage.message_id,
    chatId: String(sourceMessage.chat.id),
    userId: String(sourceMessage.from?.id ?? sourceMessage.chat.id),
    profileName,
    text: sourceMessage.text,
    timestamp: sourceMessage.date ? new Date(Number(sourceMessage.date) * 1000) : new Date(),
    rawMessage: sourceMessage
  };
}

export function formatTelegramTextMessage({ chatId, text }) {
  return {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };
}

export async function sendTelegramTextMessage({ chatId, text }) {
  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(formatTelegramTextMessage({ chatId, text }))
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.ok === false) {
    const message = body?.description ?? `Telegram send failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function routeTelegramMessage(message, rawPayload, dependencies = {}) {
  const deps = {
    isApprovedTelegramChat,
    detectLanguage,
    createIncomingConversation,
    markConversationReplied,
    markConversationFailed,
    processUserMessage,
    sendTelegramTextMessage,
    logger,
    ...dependencies
  };

  if (!deps.isApprovedTelegramChat(message.chatId)) {
    deps.logger.warn('Rejected Telegram message from unauthorized chat', {
      chatId: message.chatId,
      telegramMessageId: message.telegramMessageId
    });
    if (dependencies.sendTelegramTextMessage) {
      await deps.sendTelegramTextMessage({ chatId: message.chatId, text: 'Unauthorized' });
    }
    return { status: 'rejected' };
  }

  const detectedLanguage = deps.detectLanguage(message.text);
  const conversation = await deps.createIncomingConversation({
    whatsappMessageId: `telegram:${message.chatId}:${message.telegramMessageId}`,
    fromPhone: message.chatId,
    profileName: message.profileName,
    userMessage: message.text,
    detectedLanguage,
    channel: 'telegram',
    rawPayload
  });

  if (!conversation) {
    deps.logger.info('Skipped duplicate Telegram message', {
      chatId: message.chatId,
      telegramMessageId: message.telegramMessageId
    });
    return { status: 'duplicate' };
  }

  try {
    const agentInput = {
      message: message.text,
      userPhone: message.chatId,
      userId: message.userId,
      channel: 'telegram',
      language: detectedLanguage,
      conversationId: conversation.id,
      chatId: message.chatId
    };
    if (dependencies.agentDependencies) {
      agentInput.dependencies = dependencies.agentDependencies;
    }

    const agentResponse = await deps.processUserMessage(agentInput);

    const replyText = normalizeAgentReply(agentResponse);
    const telegramResponse = await deps.sendTelegramTextMessage({
      chatId: message.chatId,
      text: replyText
    });

    await deps.markConversationReplied({
      id: conversation.id,
      assistantReply: replyText,
      whatsappResponse: telegramResponse,
      agentResponse: {
        ...agentResponse,
        replyText
      }
    });

    return {
      status: 'replied',
      agentResponse: {
        ...agentResponse,
        replyText
      }
    };
  } catch (error) {
    await deps.markConversationFailed({
      id: conversation.id,
      errorMessage: error.message
    });
    throw error;
  }
}

function normalizeAgentReply(agentResponse) {
  const reply = isTerminalTaskToolResponse(agentResponse)
    ? agentResponse.finalReply ?? agentResponse.replyText
    : agentResponse?.replyText ?? agentResponse?.response ?? agentResponse?.text ?? agentResponse?.message;

  if (typeof reply !== 'string' || reply.length === 0) {
    throw new Error('AI Core returned a response without a string reply.');
  }
  return reply;
}

function isTerminalTaskToolResponse(agentResponse) {
  return agentResponse?.openaiCalled === false
    && agentResponse?.requiresApproval === false
    && ['create_task', 'list_tasks', 'complete_task'].includes(agentResponse?.toolNeeded);
}
