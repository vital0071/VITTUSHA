import { config, isApprovedPhoneNumber } from '../config.js';
import { logger } from '../logger.js';
import { createIncomingConversation, markConversationFailed, markConversationReplied } from '../services/conversations.js';
import { detectLanguage } from '../services/language.js';
import { brain } from '../brain/Brain.js';

export function extractIncomingMessages(payload = {}) {
  const messages = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const contactsByWaId = new Map((value.contacts ?? []).map((contact) => [contact.wa_id, contact]));

      for (const message of value.messages ?? []) {
        if (message.type !== 'text' || !message.text?.body) {
          continue;
        }

        const contact = contactsByWaId.get(message.from) ?? {};
        messages.push({
          whatsappMessageId: message.id,
          fromPhone: message.from,
          profileName: contact.profile?.name ?? null,
          text: message.text.body,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
          rawMessage: message
        });
      }
    }
  }

  return messages;
}

export async function sendWhatsAppTextMessage({ to, text }) {
  const url = `https://graph.facebook.com/${config.meta.graphApiVersion}/${config.meta.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.meta.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: text
      }
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.error?.message ?? `WhatsApp send failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function routeWhatsAppMessage(message, rawPayload, dependencies = {}) {
  const injectedBrain = dependencies.brain ?? (dependencies.processUserMessage
    ? {
        async processMessage(input) {
          const legacyResponse = await dependencies.processUserMessage({
            message: input.message,
            userPhone: input.userId,
            channel: input.channel,
            language: input.metadata?.language
          });

          return {
            answer: legacyResponse.replyText,
            intent: legacyResponse.intent ?? 'conversation',
            agent: legacyResponse.agent ?? 'LegacyAICore',
            actions: {
              toolNeeded: legacyResponse.toolNeeded ?? null,
              taskId: legacyResponse.taskId ?? null,
              requiresApproval: legacyResponse.requiresApproval ?? false
            },
            memories: {
              loaded: [],
              stored: legacyResponse.memoryStored ?? null
            },
            proactiveCommand: legacyResponse.proactiveCommand,
            metadata: {
              language: legacyResponse.language,
              openaiError: null,
              ...legacyResponse.metadata
            }
          };
        }
      }
    : brain);

  const deps = {
    isApprovedPhoneNumber,
    detectLanguage,
    createIncomingConversation,
    markConversationReplied,
    markConversationFailed,
    brain: injectedBrain,
    sendWhatsAppTextMessage,
    logger,
    ...dependencies
  };

  if (!deps.isApprovedPhoneNumber(message.fromPhone)) {
    deps.logger.warn('Rejected message from unauthorized phone number', {
      fromPhone: message.fromPhone,
      whatsappMessageId: message.whatsappMessageId
    });
    return { status: 'rejected' };
  }

  const detectedLanguage = deps.detectLanguage(message.text);
  const conversation = await deps.createIncomingConversation({
    whatsappMessageId: message.whatsappMessageId,
    fromPhone: message.fromPhone,
    profileName: message.profileName,
    userMessage: message.text,
    detectedLanguage,
    channel: 'whatsapp',
    rawPayload
  });

  if (!conversation) {
    deps.logger.info('Skipped duplicate WhatsApp message', {
      whatsappMessageId: message.whatsappMessageId
    });
    return { status: 'duplicate' };
  }

  try {
    const brainResponse = await deps.brain.processMessage({
      tenantId: 'default',
      userId: message.fromPhone,
      conversationId: String(conversation.id),
      message: message.text,
      metadata: {
        language: detectedLanguage,
        whatsappMessageId: message.whatsappMessageId,
        profileName: message.profileName,
        rawPayload
      },
      channel: 'whatsapp'
    });

    const agentResponse = {
      replyText: brainResponse.answer,
      language: brainResponse.metadata?.language ?? detectedLanguage,
      message: message.text,
      userPhone: message.fromPhone,
      channel: 'whatsapp',
      memoryStored: brainResponse.memories?.stored ?? null,
      toolNeeded: brainResponse.actions?.toolNeeded ?? null,
      taskId: brainResponse.actions?.taskId ?? null,
      requiresApproval: brainResponse.actions?.requiresApproval ?? false,
      intent: brainResponse.intent,
      agent: brainResponse.agent,
      proactiveCommand: brainResponse.proactiveCommand,
      metadata: {
        memoryCount: brainResponse.memories?.loaded?.length ?? 0,
        openaiError: brainResponse.metadata?.openaiError ?? null
      }
    };

    const whatsappResponse = await deps.sendWhatsAppTextMessage({
      to: message.fromPhone,
      text: agentResponse.replyText
    });

    deps.logger.info('response_sent', {
      channel: 'whatsapp',
      userId: message.fromPhone,
      conversationId: conversation.id,
      whatsappMessageId: message.whatsappMessageId
    });

    await deps.markConversationReplied({
      id: conversation.id,
      assistantReply: agentResponse.replyText,
      whatsappResponse,
      agentResponse
    });

    return { status: 'replied', agentResponse };
  } catch (error) {
    await deps.markConversationFailed({
      id: conversation.id,
      errorMessage: error.message
    });
    throw error;
  }
}
