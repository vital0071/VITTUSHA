import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { processUserMessage } from '../src/ai-core/agent.js';
import { extractTelegramMessage, routeTelegramMessage } from '../src/channels/telegram.js';
import { TaskService } from '../src/tasks/task-service.js';

test('Sprint 4 creates and persists tasks', async () => {
  const { taskService, cleanup, filePath } = await createTempTaskService();
  try {
    const task = await taskService.createTask({
      tenantId: 'tenant-a',
      userId: 'user-a',
      title: 'rele John demen'
    });

    assert.equal(task.title, 'rele John demen');
    assert.equal(task.status, 'pending');
    assert.ok(task.id);
    assert.ok(task.createdAt);
    assert.equal(task.completedAt, null);

    const restartedService = new TaskService({ filePath });
    const tasks = await restartedService.listTasks({
      tenantId: 'tenant-a',
      userId: 'user-a'
    });

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, 'rele John demen');
  } finally {
    await cleanup();
  }
});

test('Sprint 4 lists tasks with tenant and user isolation', async () => {
  const { taskService, cleanup } = await createTempTaskService();
  try {
    await taskService.createTask({ tenantId: 'tenant-a', userId: 'user-a', title: 'prepare report' });
    await taskService.createTask({ tenantId: 'tenant-a', userId: 'user-b', title: 'hidden user task' });
    await taskService.createTask({ tenantId: 'tenant-b', userId: 'user-a', title: 'hidden tenant task' });

    const tasks = await taskService.listTasks({
      tenantId: 'tenant-a',
      userId: 'user-a'
    });

    assert.deepEqual(tasks.map((task) => task.title), ['prepare report']);
  } finally {
    await cleanup();
  }
});

test('Sprint 4 completes a task', async () => {
  const { taskService, cleanup } = await createTempTaskService();
  try {
    await taskService.createTask({
      tenantId: 'tenant-a',
      userId: 'user-a',
      title: 'envoyer le devis'
    });

    const completed = await taskService.completeTask({
      tenantId: 'tenant-a',
      userId: 'user-a',
      title: 'envoyer le devis'
    });

    assert.equal(completed.title, 'envoyer le devis');
    assert.equal(completed.status, 'completed');
    assert.ok(completed.completedAt);
  } finally {
    await cleanup();
  }
});

test('Sprint 4 handles multilingual task intents without OpenAI', async () => {
  const { taskService, cleanup } = await createTempTaskService();
  let openaiCalls = 0;

  try {
    const dependencies = {
      taskService,
      ensureCoreMemories: async () => {},
      storeMemoryFromMessage: async () => null,
      loadMemories: async () => [],
      generateAssistantReply: async () => {
        openaiCalls += 1;
        throw new Error('OpenAI should not be called for deterministic task intents.');
      }
    };

    const created = await processUserMessage({
      message: 'Ajoute travay sa pou mwen: rele John demen',
      userPhone: 'tenant-a',
      userId: 'user-a',
      channel: 'telegram',
      language: 'ht',
      dependencies
    });

    assert.equal(created.selectedAgent, 'ExecutiveAgent');
    assert.equal(created.toolNeeded, 'create_task');
    assert.match(created.replyText, /rele John demen/);

    const listed = await processUserMessage({
      message: 'Liste mes tâches',
      userPhone: 'tenant-a',
      userId: 'user-a',
      channel: 'telegram',
      language: 'fr',
      dependencies
    });

    assert.match(listed.replyText, /rele John demen/);

    const completed = await processUserMessage({
      message: 'Make travay rele John lan fini',
      userPhone: 'tenant-a',
      userId: 'user-a',
      channel: 'telegram',
      language: 'ht',
      dependencies
    });

    assert.equal(completed.toolNeeded, 'complete_task');
    assert.match(completed.replyText, /rele John demen/);
    assert.equal(openaiCalls, 0);
  } finally {
    await cleanup();
  }
});

test('Sprint 4 Telegram path uses canonical Brain flow for task tools', async () => {
  const { taskService, cleanup } = await createTempTaskService();
  let openaiCalls = 0;
  let conversationId = 400;
  const sent = [];

  try {
    const result = await routeTelegramMessage({
      telegramMessageId: 1,
      chatId: 'tenant-a',
      userId: 'user-a',
      profileName: 'Vital',
      text: 'Remind me to prepare the report'
    }, {}, {
      isApprovedTelegramChat: () => true,
      createIncomingConversation: async () => ({ id: conversationId++ }),
      sendTelegramTextMessage: async (input) => {
        sent.push(input);
        return { ok: true };
      },
      markConversationReplied: async () => {},
      markConversationFailed: async () => {},
      logger: {
        info() {},
        warn() {},
        error() {}
      },
      agentDependencies: {
        taskService,
        ensureCoreMemories: async () => {},
        storeMemoryFromMessage: async () => null,
        loadMemories: async () => [],
        generateAssistantReply: async () => {
          openaiCalls += 1;
          throw new Error('OpenAI should not be called for deterministic task intents.');
        }
      }
    });

    assert.equal(result.status, 'replied');
    assert.equal(result.agentResponse.selectedAgent, 'ExecutiveAgent');
    assert.equal(result.agentResponse.toolNeeded, 'create_task');
    assert.match(result.agentResponse.replyText, /prepare the report/);
    assert.match(sent[0].text, /prepare the report/);
    assert.equal(openaiCalls, 0);
  } finally {
    await cleanup();
  }
});


test('Sprint 4 real Telegram runtime creates, lists, and completes Haitian Creole tasks without OpenAI', async () => {
  const { taskService, cleanup } = await createTempTaskService();
  let openaiCalls = 0;
  let conversationId = 500;
  let telegramMessageId = 1;
  const sent = [];

  const dependencies = {
    isApprovedTelegramChat: () => true,
    createIncomingConversation: async () => ({ id: conversationId++ }),
    sendTelegramTextMessage: async (input) => {
      sent.push(input);
      return { ok: true };
    },
    markConversationReplied: async () => {},
    markConversationFailed: async () => {},
    logger: {
      info() {},
      warn() {},
      error() {}
    },
    agentDependencies: {
      taskService,
      ensureCoreMemories: async () => {},
      storeMemoryFromMessage: async () => null,
      loadMemories: async () => [],
      generateAssistantReply: async () => {
        openaiCalls += 1;
        throw new Error('OpenAI should not be called for deterministic Telegram task intents.');
      }
    }
  };

  async function send(text) {
    return routeTelegramMessage({
      telegramMessageId: telegramMessageId++,
      chatId: 'telegram-chat-1',
      userId: 'telegram-user-1',
      profileName: 'Vital',
      text
    }, { update_id: telegramMessageId }, dependencies);
  }

  try {
    const created = await send('Ajoute travay sa pou mwen: rele John demen');
    assert.equal(created.agentResponse.toolNeeded, 'create_task');
    assert.equal(created.agentResponse.selectedAgent, 'ExecutiveAgent');
    assert.equal(created.agentResponse.replyText, 'Travay la ajoute: rele John demen.');
    assert.doesNotMatch(created.agentResponse.replyText, /rap[eè]l|rappel|reminder|kalandriye|calendar|randevou/i);

    const listed = await send('Ki travay mwen genyen?');
    assert.equal(listed.agentResponse.toolNeeded, 'list_tasks');
    assert.match(listed.agentResponse.replyText, /rele John demen/);

    const listedVariant = await send('Lis travay mwen yo');
    assert.equal(listedVariant.agentResponse.toolNeeded, 'list_tasks');
    assert.match(listedVariant.agentResponse.replyText, /rele John demen/);

    const completed = await send('Make travay rele John lan fini');
    assert.equal(completed.agentResponse.toolNeeded, 'complete_task');
    assert.match(completed.agentResponse.replyText, /rele John demen/);

    const tasks = await taskService.listTasks({
      tenantId: 'telegram-chat-1',
      userId: 'telegram-user-1'
    });

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, 'rele John demen');
    assert.equal(tasks[0].status, 'completed');
    assert.equal(openaiCalls, 0);
    assert.deepEqual(sent.map((message) => message.chatId), [
      'telegram-chat-1',
      'telegram-chat-1',
      'telegram-chat-1',
      'telegram-chat-1'
    ]);
  } finally {
    await cleanup();
  }
});


test('Sprint 4 real Telegram runtime supports Haitian Creole create variant before OpenAI', async () => {
  const { taskService, cleanup } = await createTempTaskService();
  let openaiCalls = 0;

  try {
    const result = await routeTelegramMessage({
      telegramMessageId: 10,
      chatId: 'telegram-chat-2',
      userId: 'telegram-user-2',
      profileName: 'Vital',
      text: 'Kreye yon travay pou rele John demen'
    }, { update_id: 10 }, {
      isApprovedTelegramChat: () => true,
      createIncomingConversation: async () => ({ id: 700 }),
      sendTelegramTextMessage: async () => ({ ok: true }),
      markConversationReplied: async () => {},
      markConversationFailed: async () => {},
      logger: {
        info() {},
        warn() {},
        error() {}
      },
      agentDependencies: {
        taskService,
        generateAssistantReply: async () => {
          openaiCalls += 1;
          throw new Error('OpenAI should not be called for deterministic Telegram task intents.');
        }
      }
    });

    const tasks = await taskService.listTasks({
      tenantId: 'telegram-chat-2',
      userId: 'telegram-user-2'
    });

    assert.equal(result.agentResponse.toolNeeded, 'create_task');
    assert.equal(result.agentResponse.replyText, 'Travay la ajoute: rele John demen.');
    assert.doesNotMatch(result.agentResponse.replyText, /rap[eè]l|rappel|reminder|kalandriye|calendar|randevou/i);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, 'rele John demen');
    assert.equal(openaiCalls, 0);
  } finally {
    await cleanup();
  }
});


test('Sprint 4 Telegram replies ignore quoted bot text when parsing task commands', async () => {
  const { taskService, cleanup } = await createTempTaskService();
  let openaiCalls = 0;
  const sent = [];

  try {
    const extracted = extractTelegramMessage({
      update_id: 42,
      message: {
        message_id: 42,
        date: 1710000000,
        text: 'Wi',
        chat: { id: 'telegram-chat-quoted', type: 'private' },
        from: { id: 'telegram-user-quoted', first_name: 'Vital' },
        reply_to_message: {
          message_id: 41,
          text: 'Ajoute travay sa pou mwen: rele John demen',
          from: { is_bot: true, username: 'vittusha_bot' }
        }
      }
    });

    const result = await routeTelegramMessage(extracted, { update_id: 42 }, {
      isApprovedTelegramChat: () => true,
      createIncomingConversation: async () => ({ id: 800 }),
      sendTelegramTextMessage: async (input) => {
        sent.push(input);
        return { ok: true };
      },
      markConversationReplied: async () => {},
      markConversationFailed: async () => {},
      logger: {
        info() {},
        warn() {},
        error() {}
      },
      agentDependencies: {
        taskService,
        ensureCoreMemories: async () => {},
        storeMemoryFromMessage: async () => null,
        loadMemories: async () => [],
        generateAssistantReply: async () => {
          openaiCalls += 1;
          return 'Mwen konprann.';
        }
      }
    });

    const tasks = await taskService.listTasks({
      tenantId: 'telegram-chat-quoted',
      userId: 'telegram-user-quoted'
    });

    assert.equal(extracted.text, 'Wi');
    assert.equal(result.agentResponse.toolNeeded, null);
    assert.equal(result.status, 'replied');
    assert.equal(sent[0].text, 'Mwen konprann.');
    assert.equal(tasks.length, 0);
    assert.equal(openaiCalls, 1);
  } finally {
    await cleanup();
  }
});

async function createTempTaskService() {
  const dir = await mkdtemp(join(tmpdir(), 'vittusha-tasks-'));
  const filePath = join(dir, 'tasks.json');
  return {
    filePath,
    taskService: new TaskService({ filePath }),
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}
