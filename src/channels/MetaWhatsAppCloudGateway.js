import { config, isApprovedPhoneNumber } from '../config.js';
import { logger as defaultLogger } from '../shared/logger.js';
import { brain as defaultBrain } from '../brain/Brain.js';
import { detectLanguage } from '../services/language.js';
import {
  createIncomingConversation,
  markConversationFailed,
  markConversationReplied
} from '../services/conversations.js';
import { ChannelGateway } from './ChannelGateway.js';

export class MetaWhatsAppCloudGateway extends ChannelGateway {
  constructor(dependencies = {}) {
    super();
    this.brain = dependencies.brain ?? defaultBrain;
    this.logger = dependencies.logger ?? defaultLogger;
    this.isApprovedPhoneNumber = dependencies.isApprovedPhoneNumber ?? isApprovedPhoneNumber;
    this.detectLanguage = dependencies.detectLanguage ?? detectLanguage;
    this.createIncomingConversation = dependencies.createIncomingConversation ?? createIncomingConversation;
    this.markConversationReplied = dependencies.markConversationReplied ?? markConversationReplied;
    this.markConversationFailed = dependencies.markConversationFailed ?? markConversationFailed;
    this.fetch = dependencies.fetch ?? fetch;
  }

  receive(payload = {}) {
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
            channel: 'whatsapp',
            channelMessageId: message.id,
            userId: message.from,
            profileName: contact.profile?.name ?? null,
            text: message.text.body,
            timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
            rawMessage: message,
            rawPayload: payload
          });
        }
      }
    }

    return messages;
  }

  async acknowledge(_message) {
    return { acknowledged: true };
  }

  async typing(_message) {
    return { supported: false };
  }

  async handle(message) {
    if (!this.isApprovedPhoneNumber(message.userId)) {
      this.logger.warn('Rejected message from unauthorized phone number', {
        fromPhone: message.userId,
        whatsappMessageId: message.channelMessageId
      });
      return { status: 'rejected' };
    }

    const detectedLanguage = this.detectLanguage(message.text);
    const conversation = await this.createIncomingConversation({
      whatsappMessageId: message.channelMessageId,
      fromPhone: message.userId,
      profileName: message.profileName,
      userMessage: message.text,
      detectedLanguage,
      channel: 'whatsapp',
      rawPayload: message.rawPayload
    });

    if (!conversation) {
      this.logger.info('Skipped duplicate WhatsApp message', {
        whatsappMessageId: message.channelMessageId
      });
      return { status: 'duplicate' };
    }

    try {
      const brainResponse = await this.brain.processMessage({
        tenantId: 'default',
        userId: message.userId,
        channel: 'whatsapp',
        conversationId: String(conversation.id),
        message: message.text,
        metadata: {
          language: detectedLanguage,
          whatsappMessageId: message.channelMessageId,
          profileName: message.profileName,
          rawPayload: message.rawPayload
        }
      });

      const sent = await this.send({
        to: message.userId,
        reply: brainResponse.reply
      });

      this.logger.info('response_sent', {
        channel: 'whatsapp',
        userId: message.userId,
        conversationId: conversation.id,
        whatsappMessageId: message.channelMessageId
      });

      const agentResponse = this.toLegacyAgentResponse({
        brainResponse,
        message,
        detectedLanguage
      });

      await this.markConversationReplied({
        id: conversation.id,
        assistantReply: brainResponse.reply,
        whatsappResponse: sent,
        agentResponse
      });

      return { status: 'replied', agentResponse };
    } catch (error) {
      await this.markConversationFailed({
        id: conversation.id,
        errorMessage: error.message
      });
      throw error;
    }
  }

  async send({ to, reply }) {
    const url = `https://graph.facebook.com/${config.meta.graphApiVersion}/${config.meta.phoneNumberId}/messages`;

    const response = await this.fetch(url, {
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
          body: reply
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

  toLegacyAgentResponse({ brainResponse, message, detectedLanguage }) {
    return {
      replyText: brainResponse.reply,
      language: brainResponse.metadata?.language ?? detectedLanguage,
      message: message.text,
      userPhone: message.userId,
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
  }
}
