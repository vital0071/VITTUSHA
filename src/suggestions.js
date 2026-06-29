import { query } from './db.js';

export const SUGGESTION_STATUSES = ['pending', 'approved', 'dismissed', 'completed'];
export const SUGGESTION_PRIORITIES = ['low', 'medium', 'high'];

function assertSuggestionInput({ status = 'pending', priority = 'medium' }) {
  if (!SUGGESTION_STATUSES.includes(status)) {
    throw new Error(`Invalid suggestion status: ${status}`);
  }
  if (!SUGGESTION_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid suggestion priority: ${priority}`);
  }
}

export async function createSuggestion({ userId, title, description, type, priority = 'medium', status = 'pending', relatedTaskId = null, metadata = {} }) {
  return createSuggestionWithQuery(query, { userId, title, description, type, priority, status, relatedTaskId, metadata });
}

export async function createSuggestionWithQuery(queryFn, { userId, title, description, type, priority = 'medium', status = 'pending', relatedTaskId = null, metadata = {} }) {
  assertSuggestionInput({ status, priority });

  const result = await queryFn(
    `
      INSERT INTO suggestions (user_id, title, description, type, priority, status, related_task_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, title, description, type, priority, status, related_task_id, metadata, created_at, updated_at
    `,
    [userId, title, description, type, priority, status, relatedTaskId, JSON.stringify(metadata)]
  );

  return result.rows[0];
}

export async function listPendingSuggestions({ userId, limit = 10 }) {
  return listPendingSuggestionsWithQuery(query, { userId, limit });
}

export async function listPendingSuggestionsWithQuery(queryFn, { userId, limit = 10 }) {
  const result = await queryFn(
    `
      SELECT id, user_id, title, description, type, priority, status, related_task_id, metadata, created_at, updated_at
      FROM suggestions
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

export async function approveSuggestion({ userId, suggestionId }) {
  return updateSuggestionStatus({ userId, suggestionId, status: 'approved' });
}

export async function dismissSuggestion({ userId, suggestionId }) {
  return updateSuggestionStatus({ userId, suggestionId, status: 'dismissed' });
}

export async function completeSuggestion({ userId, suggestionId }) {
  return updateSuggestionStatus({ userId, suggestionId, status: 'completed' });
}

export async function updateSuggestionStatus({ userId, suggestionId, status }) {
  return updateSuggestionStatusWithQuery(query, { userId, suggestionId, status });
}

export async function updateSuggestionStatusWithQuery(queryFn, { userId, suggestionId, status }) {
  assertSuggestionInput({ status, priority: 'medium' });

  const result = await queryFn(
    `
      UPDATE suggestions
      SET status = $3,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, title, description, type, priority, status, related_task_id, metadata, created_at, updated_at
    `,
    [suggestionId, userId, status]
  );

  return result.rows[0] ?? null;
}
