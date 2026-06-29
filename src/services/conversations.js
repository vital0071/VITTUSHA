import { query } from '../db.js';

export async function createIncomingConversation({
  whatsappMessageId,
  fromPhone,
  profileName,
  userMessage,
  detectedLanguage,
  channel = 'whatsapp',
  rawPayload
}) {
  const result = await query(
    `
      INSERT INTO conversations (
        whatsapp_message_id,
        from_phone,
        profile_name,
        user_message,
        detected_language,
        channel,
        raw_payload,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'received')
      ON CONFLICT (whatsapp_message_id) DO NOTHING
      RETURNING id
    `,
    [whatsappMessageId, fromPhone, profileName, userMessage, detectedLanguage, channel, rawPayload]
  );

  return result.rows[0] ?? null;
}

export async function markConversationReplied({ id, assistantReply, whatsappResponse, agentResponse = null }) {
  await query(
    `
      UPDATE conversations
      SET assistant_reply = $2,
          whatsapp_response = $3,
          agent_response = $4,
          tool_needed = $5,
          task_id = $6,
          status = 'replied',
          replied_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, assistantReply, whatsappResponse, agentResponse, agentResponse?.toolNeeded ?? null, agentResponse?.taskId ?? null]
  );
}

export async function markConversationFailed({ id, errorMessage }) {
  await query(
    `
      UPDATE conversations
      SET status = 'failed',
          error_message = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, errorMessage]
  );
}
