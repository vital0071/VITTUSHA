import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { languageInstruction } from '../services/language.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptPath = join(__dirname, '..', 'prompts', 'system-prompt.md');

export async function loadSystemPrompt() {
  return readFile(promptPath, 'utf8');
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
  memoryContext = null,
  neededTool = null,
  pendingTask = null
}) {
  const systemPrompt = await loadSystemPrompt();
  const memoryText = memories.map((memory) => `- ${memory.value}`).join('\n') || '- No saved memories yet.';
  const memoryContextText = memoryContext?.promptText || `Saved memories about the user:\n${memoryText}`;
  const toolText = neededTool
    ? `Tool likely needed: ${neededTool.name}. Status: placeholder. Do not claim it was used. Ask for approval before any external action.`
    : 'No external tool appears necessary.';
  const taskText = pendingTask
    ? `A pending approval task was created with id ${pendingTask.id}: ${pendingTask.title}.`
    : 'No task was created for this message.';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.openai.model,
      instructions: [
        systemPrompt,
        languageInstruction(detectedLanguage),
        `Memory Engine Context:\n${memoryContextText}`,
        toolText,
        taskText,
        'If the Memory Engine Context contains a direct answer to the user question, use that memory confidently. Do not ask the user to repeat information already present in memory.',
        'Return a concise WhatsApp-friendly answer. If a placeholder tool would be needed, say which tool is needed and ask for approval. Do not say you performed the action.'
      ].join('\n\n'),
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
