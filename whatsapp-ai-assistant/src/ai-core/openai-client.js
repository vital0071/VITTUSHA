import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { languageInstruction } from '../services/language.js';
import { buildCoreIdentityPrompt } from '../identity/core-identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptPath = join(__dirname, '..', 'prompts', 'system-prompt.md');

export async function loadSystemPrompt() {
  return readFile(promptPath, 'utf8');
}

export async function buildAssistantInstructions({
  detectedLanguage,
  memories = [],
  neededTool = null,
  pendingTask = null,
  recentConversations = [],
  userProfile = null,
  projectContext = []
}) {
  const systemPrompt = await loadSystemPrompt();
  const memoryText = formatMemories(memories);
  const profileText = formatUserProfile(userProfile);
  const projectText = formatProjectContext(projectContext);
  const recentText = formatRecentConversations(recentConversations);
  const toolText = neededTool
    ? `Tool likely needed: ${neededTool.name}. Status: placeholder. Do not claim it was used. Ask for approval before any external action.`
    : 'No external tool appears necessary.';
  const taskText = pendingTask
    ? `A pending approval task was created with id ${pendingTask.id}: ${pendingTask.title}.`
    : 'No task was created for this message.';

  return [
    buildCoreIdentityPrompt(),
    systemPrompt,
    languageInstruction(detectedLanguage),
    `Authenticated user profile/context:\n${profileText}`,
    `Relevant long-term memories about the user. These memories may describe the user, but they must never redefine Vittusha's AI identity:\n${memoryText}`,
    `Relevant project context:\n${projectText}`,
    `Recent conversation context:\n${recentText}`,
    toolText,
    taskText,
    'Return a concise channel-friendly answer. If a placeholder tool would be needed, say which tool is needed and ask for approval. Do not say you performed the action.'
  ].join('\n\n');
}

function extractOutputText(responseBody) {
  if (typeof responseBody.output_text === 'string' && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  const parts = [];
  for (const item of responseBody.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

export async function generateAssistantReply({
  userMessage,
  detectedLanguage,
  memories = [],
  neededTool = null,
  pendingTask = null,
  recentConversations = [],
  userProfile = null,
  projectContext = []
}) {
  const instructions = await buildAssistantInstructions({
    detectedLanguage,
    memories,
    neededTool,
    pendingTask,
    recentConversations,
    userProfile,
    projectContext
  });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.openai.model,
      instructions,
      input: userMessage,
      max_output_tokens: config.openai.maxOutputTokens,
      store: false
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.error?.message ?? `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const reply = extractOutputText(body);
  if (!reply) {
    throw new Error('OpenAI returned an empty reply.');
  }

  return reply;
}

function formatMemories(memories = []) {
  return memories.map((memory) => `- ${memory.value}`).join('\n') || '- No saved memories yet.';
}

function formatUserProfile(userProfile) {
  if (!userProfile) {
    return '- No authenticated user profile was provided.';
  }

  const parts = [];
  if (userProfile.displayName) parts.push(`Display name: ${userProfile.displayName}`);
  if (userProfile.vittushaUserId) parts.push(`Vittusha user id: ${userProfile.vittushaUserId}`);
  return parts.map((item) => `- ${item}`).join('\n') || '- No authenticated user profile was provided.';
}

function formatProjectContext(projectContext = []) {
  return projectContext.length > 0
    ? projectContext.map((item) => `- ${item}`).join('\n')
    : '- No project context was provided.';
}

function formatRecentConversations(recentConversations = []) {
  if (recentConversations.length === 0) {
    return '- No recent conversation context was found.';
  }

  return recentConversations
    .map((item) => {
      const userText = item.userMessage ? `User: ${item.userMessage}` : null;
      const assistantText = item.assistantReply ? `Vittusha: ${item.assistantReply}` : null;
      return [userText, assistantText].filter(Boolean).join(' | ');
    })
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join('\n') || '- No recent conversation context was found.';
}
