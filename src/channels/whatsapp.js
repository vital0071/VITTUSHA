import { config, isApprovedPhoneNumber } from '../config.js';
import { logger } from '../logger.js';
import { createIncomingConversation, markConversationFailed, markConversationReplied } from '../services/conversations.js';
import { detectLanguage } from '../services/language.js';
import { processUserMessage } from '../ai-core/agent.js';

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
  const deps = {
    isApprovedPhoneNumber,
    detectLanguage,
    createIncomingConversation,
    markConversationReplied,
    markConversationFailed,
    processUserMessage,
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
    const agentResponse = await deps.processUserMessage({
      message: message.text,
      userPhone: message.fromPhone,
      channel: 'whatsapp',
      language: detectedLanguage
    });

    const whatsappResponse = await deps.sendWhatsAppTextMessage({
      to: message.fromPhone,
      text: agentResponse.replyText
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
