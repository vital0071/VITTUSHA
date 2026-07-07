import { query } from '../db.js';

export async function createConversation(input) {
  return createIncomingConversation(input);
}

export async function createIncomingConversation({
  whatsappMessageId,
  fromPhone,
  profileName,
  userMessage,
  detectedLanguage,
  channel = 'whatsapp',
  rawPayload
}) {
  const metadata = {
    status: 'received',
    profile: {
      name: profileName ?? null
    },
    message: {
      text: userMessage ?? null,
      detectedLanguage: detectedLanguage ?? null
    },
    rawPayload: rawPayload ?? null
  };

  const result = await query(
    `
      INSERT INTO conversations (
        user_id,
        conversation_id,
        channel,
        metadata
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET
        metadata = COALESCE(conversations.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id
    `,
    [fromPhone, whatsappMessageId, channel, metadata]
  );

  return result.rows[0] ?? null;
}

export async function markConversationReplied({ id, assistantReply, whatsappResponse, agentResponse = null }) {
  const metadata = {
    status: 'replied',
    assistantReply: assistantReply ?? null,
    channelResponse: whatsappResponse ?? null
  };

  await query(
    `
      UPDATE conversations
      SET agent_response = $2,
          tool_needed = $3,
          task_id = $4,
          metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, agentResponse, agentResponse?.toolNeeded ?? null, agentResponse?.taskId ?? null, metadata]
  );
}

export async function markConversationFailed({ id, errorMessage }) {
  const metadata = {
    status: 'failed',
    error: {
      message: errorMessage ?? null
    }
  };

  await query(
    `
      UPDATE conversations
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, metadata]
  );
}

export async function listRecentConversations(input) {
  return listRecentConversationsWithQuery(query, input);
}

export async function listRecentConversationsWithQuery(queryFn, { userId, excludeConversationId = null, excludeId = null, limit = 10 }) {
  const result = await queryFn(
    `
      SELECT id,
             conversation_id,
             channel,
             metadata,
             agent_response,
             tool_needed,
             task_id,
             created_at,
             updated_at
      FROM conversations
      WHERE user_id = $1
        AND ($2::text IS NULL OR conversation_id <> $2)
        AND ($3::bigint IS NULL OR id <> $3)
      ORDER BY created_at DESC
      LIMIT $4
    `,
    [userId, excludeConversationId, excludeId, limit]
  );

  return result.rows
    .slice()
    .reverse()
    .map(formatConversationRow);
}

function formatConversationRow(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    channel: row.channel,
    userMessage: row.metadata?.message?.text ?? null,
    assistantReply: row.metadata?.assistantReply ?? null,
    detectedLanguage: row.metadata?.message?.detectedLanguage ?? null,
    toolNeeded: row.tool_needed ?? null,
    taskId: row.task_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
