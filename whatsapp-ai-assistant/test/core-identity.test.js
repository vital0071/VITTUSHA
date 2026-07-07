import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantInstructions, generateAssistantReply } from '../src/ai-core/openai-client.js';
import { buildCoreIdentityPrompt, isAiIdentityConflict } from '../src/identity/core-identity.js';

const identityQuestions = [
  'Ki non ou?',
  'Ou rele Vittusha?',
  'What is your name?',
  "Comment tu t'appelles ?"
];

test('core identity declares Vittusha across identity questions with no memory context', () => {
  const prompt = buildCoreIdentityPrompt();
  for (const question of identityQuestions) {
    assert.match(prompt, /Your name is Vittusha/);
    assert.match(prompt, /Your identity is always Vittusha/);
    assert.match(prompt, /Never claim that you have no name/);
    assert.ok(question.length > 0);
  }
});

test('OpenAI instructions put Vittusha identity before behavior and memory context', async () => {
  const instructions = await buildAssistantInstructions({
    detectedLanguage: 'ht',
    memories: [{ value: 'Your name is Assistant AI' }],
    recentConversations: [],
    userProfile: null
  });

  const identityIndex = instructions.indexOf('Vittusha Core Identity');
  const behaviorIndex = instructions.indexOf('Vittusha behavioral and system rules');
  const memoryIndex = instructions.indexOf('Relevant long-term memories');

  assert.ok(identityIndex >= 0);
  assert.ok(behaviorIndex > identityIndex);
  assert.ok(memoryIndex > behaviorIndex);
  assert.match(instructions, /Your name is Vittusha/);
  assert.match(instructions, /must never redefine Vittusha's AI identity/);
  assert.match(instructions, /Your name is Assistant AI/);
});

test('conflicting user memory cannot rename Vittusha', () => {
  assert.equal(isAiIdentityConflict('Your name is Assistant AI'), true);
  assert.equal(isAiIdentityConflict('ou rele Assistant AI'), true);
  assert.equal(isAiIdentityConflict('Your name is Vittusha'), false);
});

test('core identity is channel independent for telegram whatsapp and web', async () => {
  const prompts = await Promise.all(['telegram', 'whatsapp', 'web'].map((channel) => buildAssistantInstructions({
    detectedLanguage: 'en',
    memories: [],
    recentConversations: [],
    userProfile: { vittushaUserId: `user-${channel}` }
  })));

  for (const prompt of prompts) {
    assert.match(prompt, /Your name is Vittusha/);
    assert.doesNotMatch(prompt, /personal assistant of Vital-Herne Zephy/i);
  }
});


test('ExecutiveAgent OpenAI path receives Vittusha identity even with zero memories', async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ output_text: 'Mwen se Vittusha.' })
    };
  };

  try {
    const reply = await generateAssistantReply({
      userMessage: 'Ki non ou?',
      detectedLanguage: 'ht',
      memories: [],
      recentConversations: []
    });

    assert.equal(reply, 'Mwen se Vittusha.');
    assert.match(requestBody.instructions, /Your name is Vittusha/);
    assert.match(requestBody.instructions, /No saved memories yet/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('user context remains separate across users and does not define AI identity', async () => {
  const userA = await buildAssistantInstructions({
    detectedLanguage: 'en',
    memories: [{ value: 'User name: Alice' }],
    userProfile: { displayName: 'Alice', vittushaUserId: 'user-a' }
  });
  const userB = await buildAssistantInstructions({
    detectedLanguage: 'en',
    memories: [{ value: 'User name: Bob' }],
    userProfile: { displayName: 'Bob', vittushaUserId: 'user-b' }
  });

  assert.match(userA, /User name: Alice/);
  assert.doesNotMatch(userA, /User name: Bob/);
  assert.match(userB, /User name: Bob/);
  assert.doesNotMatch(userB, /User name: Alice/);
  assert.match(userA, /Your name is Vittusha/);
  assert.match(userB, /Your name is Vittusha/);
});
