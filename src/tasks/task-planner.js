import { query } from '../db.js';

export const TASK_STATUSES = ['pending', 'approved', 'running', 'completed', 'cancelled'];

export function buildApprovalTask({ userMessage, tool }) {
  return {
    title: `Approval needed: ${tool.name}`,
    description: `The user request appears to need the ${tool.name} tool. The agent must ask for explicit approval before any external action.`,
    status: 'pending',
    steps: [
      'Clarify the requested outcome if needed.',
      `Ask Vital-Herne for explicit approval to use ${tool.name}.`,
      'Only execute after approval in a future implementation.'
    ],
    metadata: {
      requestedTool: tool.name,
      originalMessage: userMessage
    }
  };
}

export async function createTask({ userPhone, channel, title, description, status = 'pending', steps = [], metadata = {} }) {
  return createTaskWithQuery(query, { userPhone, channel, title, description, status, steps, metadata });
}

export async function createTaskWithQuery(queryFn, { userPhone, channel, title, description, status = 'pending', steps = [], metadata = {} }) {
  if (!TASK_STATUSES.includes(status)) {
    throw new Error(`Invalid task status: ${status}`);
  }

  const result = await queryFn(
    `
      INSERT INTO tasks (user_phone, channel, title, description, status, steps, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, user_phone, channel, title, description, status, steps, metadata, created_at, updated_at
    `,
    [userPhone, channel, title, description, status, JSON.stringify(steps), JSON.stringify(metadata)]
  );

  return result.rows[0];
}
