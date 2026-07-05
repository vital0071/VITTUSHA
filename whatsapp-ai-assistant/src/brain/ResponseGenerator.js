const GENERIC_ACKNOWLEDGEMENTS = new Set([
  'compris',
  'compris.',
  'ok',
  'ok.',
  'daccord',
  "d'accord",
  "d'accord.",
  'bien recu',
  'bien reçu',
  'bien reçu.',
  'understood',
  'understood.',
  'got it',
  'got it.',
  'mwen konprann',
  'mwen konprann.'
]);

export class ResponseGenerator {
  generate(context = {}) {
    return generateResponse(context);
  }
}

export function generateResponse(context = {}) {
  const directAnswerResult = normalizeDirectAnswerResult(
    context.directAnswerResult ?? context.directMemoryAnswer,
    context
  );

  if (directAnswerResult?.matched) {
    return {
      ...context,
      finalReply: directAnswerResult.answer,
      replyText: directAnswerResult.answer,
      response: directAnswerResult.answer,
      text: directAnswerResult.answer,
      message: directAnswerResult.answer,
      openaiCalled: false,
      directAnswerResult
    };
  }

  const fallbackReply = context.finalReply ?? context.replyText ?? context.response ?? context.text ?? context.message;
  return {
    ...context,
    finalReply: fallbackReply,
    replyText: fallbackReply,
    response: fallbackReply,
    text: fallbackReply,
    message: fallbackReply,
    directAnswerResult
  };
}

export function normalizeDirectAnswerResult(result, context = {}) {
  if (!result?.matched) {
    return result ?? null;
  }

  const language = result.language ?? context.language ?? 'fr';
  const answer = factualAnswerFrom(result, context, language);

  return {
    ...result,
    matched: true,
    reason: result.reason ?? 'matched_memory',
    matchedQuestionType: result.matchedQuestionType ?? context.matchedQuestionType ?? 'memory',
    memory: result.memory ?? context.memory ?? null,
    project: result.project ?? context.project ?? null,
    answer,
    language
  };
}

function factualAnswerFrom(result, context, language) {
  const answer = result.answer ?? result.response ?? result.text ?? result.message;
  if (isFactualAnswer(answer)) {
    return answer;
  }

  const memoryValue = result.memory?.value ?? context.memory?.value;
  if (isFactualAnswer(memoryValue)) {
    return memoryValue;
  }

  const projectName = result.project?.name
    ?? context.project?.name
    ?? result.memory?.projectName
    ?? context.memory?.projectName;

  if (projectName) {
    return projectAnswer(projectName, language);
  }

  return answer;
}

function isFactualAnswer(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  return !GENERIC_ACKNOWLEDGEMENTS.has(normalize(value));
}

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function projectAnswer(projectName, language) {
  const normalizedLanguage = normalize(language);

  if (normalizedLanguage.startsWith('en')) {
    return `You are developing ${projectName}.`;
  }

  if (normalizedLanguage.startsWith('ht') || normalizedLanguage.includes('creole') || normalizedLanguage.includes('kreyol')) {
    return `W ap devlope ${projectName}.`;
  }

  return `Vous développez ${projectName}.`;
}
