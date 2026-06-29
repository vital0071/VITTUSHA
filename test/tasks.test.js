import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApprovalTask, createTaskWithQuery } from '../src/tasks/task-planner.js';
import { getTool } from '../src/tools/registry.js';

test('builds an approval task for a placeholder tool', () => {
  const task = buildApprovalTask({
    userMessage: 'Send an email to this lead.',
    tool: getTool('gmail')
  });

  assert.equal(task.status, 'pending');
  assert.equal(task.metadata.requestedTool, 'gmail');
  assert.match(task.description, /approval/i);
});

test('creates a task record with pending status and JSON steps', async () => {
  const created = await createTaskWithQuery(async (sql, params) => {
    assert.match(sql, /INSERT INTO tasks/);
    assert.equal(params[0], '50912345678');
    assert.equal(params[4], 'pending');
    assert.equal(params[5], JSON.stringify(['Ask for approval']));
    assert.equal(params[6], JSON.stringify({ requestedTool: 'gmail' }));
    return {
      rows: [
        {
          id: 20,
          user_phone: params[0],
          channel: params[1],
          title: params[2],
          description: params[3],
          status: params[4],
          steps: JSON.parse(params[5]),
          metadata: JSON.parse(params[6])
        }
      ]
    };
  }, {
    userPhone: '50912345678',
    channel: 'whatsapp',
    title: 'Approval needed: gmail',
    description: 'Needs approval.',
    steps: ['Ask for approval'],
    metadata: { requestedTool: 'gmail' }
  });

  assert.equal(created.id, 20);
  assert.equal(created.status, 'pending');
  assert.deepEqual(created.steps, ['Ask for approval']);
});
