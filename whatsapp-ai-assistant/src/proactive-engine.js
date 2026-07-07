import { query } from './db.js';
import { createSuggestion, listPendingSuggestions } from './suggestions.js';
import { listRecentConversations } from './services/conversations.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export async function loadProactiveContext({ userId }) {
  const [tasksResult, suggestions, recentConversations] = await Promise.all([
    query(
      `
        SELECT id, title, description, status, steps, metadata, created_at, updated_at
        FROM tasks
        WHERE user_phone = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [userId]
    ),
    listPendingSuggestions({ userId, limit: 20 }),
    listRecentConversations({ userId, limit: 10 })
  ]);

  return {
    tasks: tasksResult.rows,
    pendingSuggestions: suggestions,
    recentConversations
  };
}

export function analyzeProactiveState({ tasks = [], pendingSuggestions = [], recentConversations = [], now = new Date() }) {
  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const unapprovedTasks = tasks.filter((task) => task.status === 'pending');
  const blockedTasks = tasks.filter((task) => {
    if (!['pending', 'approved', 'running'].includes(task.status)) {
      return false;
    }
    const updatedAt = new Date(task.updated_at ?? task.created_at);
    return now - updatedAt >= THREE_DAYS_MS;
  });

  const suggestions = [];

  if (unapprovedTasks.length > 0) {
    suggestions.push({
      title: `Ou gen ${unapprovedTasks.length} travay ki poko apwouve.`,
      description: 'Revize travay sa yo epi deside si ou vle apwouve, modifye, oswa anile yo.',
      type: 'approval_review',
      priority: unapprovedTasks.length >= 3 ? 'high' : 'medium',
      relatedTaskId: unapprovedTasks[0]?.id ?? null,
      metadata: { taskIds: unapprovedTasks.map((task) => task.id) }
    });
  }

  for (const task of blockedTasks.slice(0, 3)) {
    suggestions.push({
      title: 'Travay sa bloke depi 3 jou.',
      description: `Task: ${task.title}. Pran yon desizyon: apwouve, kontinye, oswa anile li.`,
      type: 'blocked_task',
      priority: 'high',
      relatedTaskId: task.id,
      metadata: { taskId: task.id }
    });
  }

  if (pendingTasks.length > 0) {
    suggestions.push({
      title: 'Ou gen yon task pending ki bezwen desizyon.',
      description: pendingTasks[0].title,
      type: 'pending_decision',
      priority: 'medium',
      relatedTaskId: pendingTasks[0].id,
      metadata: { taskId: pendingTasks[0].id }
    });
  }

  if (pendingSuggestions.length > 0) {
    suggestions.push({
      title: `Ou gen ${pendingSuggestions.length} suggestion ki ap tann.`,
      description: 'Gade suggestions yo epi chwazi sa pou apwouve, ignore, oswa complete.',
      type: 'suggestion_review',
      priority: pendingSuggestions.length >= 5 ? 'high' : 'medium',
      relatedTaskId: null,
      metadata: { suggestionIds: pendingSuggestions.map((suggestion) => suggestion.id) }
    });
  }

  suggestions.push({
    title: 'Men 5 aksyon ou ta dwe fè jodi a.',
    description: buildDailyActions({ pendingTasks, blockedTasks, pendingSuggestions, recentConversations }),
    type: 'daily_plan',
    priority: blockedTasks.length > 0 || unapprovedTasks.length >= 3 ? 'high' : 'medium',
    relatedTaskId: pendingTasks[0]?.id ?? null,
    metadata: {
      pendingTaskCount: pendingTasks.length,
      blockedTaskCount: blockedTasks.length,
      pendingSuggestionCount: pendingSuggestions.length,
      recentConversationCount: recentConversations.length
    }
  });

  return {
    pendingTasks,
    unapprovedTasks,
    blockedTasks,
    pendingSuggestions,
    recentConversations,
    suggestions
  };
}

export async function generateProactiveSuggestions({ userId, context = null, persist = true }) {
  const proactiveContext = context ?? await loadProactiveContext({ userId });
  const analysis = analyzeProactiveState(proactiveContext);

  if (!persist) {
    return analysis;
  }

  const createdSuggestions = [];
  for (const suggestion of analysis.suggestions) {
    createdSuggestions.push(await createSuggestion({ userId, ...suggestion }));
  }

  return { ...analysis, suggestions: createdSuggestions };
}

export async function generateDailyCheckIn({ userId, persist = true }) {
  const analysis = await generateProactiveSuggestions({ userId, persist });
  return formatDailyCheckIn(analysis.suggestions);
}

export function formatSuggestionsList(suggestions = []) {
  if (suggestions.length === 0) {
    return 'Ou pa gen suggestion pending pou kounye a.';
  }

  return suggestions
    .map((suggestion, index) => `${index + 1}. ${suggestion.title}\n${suggestion.description}`)
    .join('\n\n');
}

export function formatDailyCheckIn(suggestions = []) {
  const topSuggestions = suggestions.slice(0, 5);
  return `Bonjou. Men check-in jodi a:\n\n${formatSuggestionsList(topSuggestions)}\n\nMwen pap egzekite okenn aksyon ekstèn san apwobasyon ou.`;
}

function buildDailyActions({ pendingTasks, blockedTasks, pendingSuggestions, recentConversations }) {
  const actions = [
    blockedTasks.length > 0 ? 'Revize task ki bloke yo.' : 'Verifye priyorite prensipal pou jounen an.',
    pendingTasks.length > 0 ? 'Pran desizyon sou task pending yo.' : 'Kreye 1-3 task klè pou jounen an.',
    pendingSuggestions.length > 0 ? 'Triye suggestions pending yo.' : 'Idantifye pwochen aksyon ki gen plis enpak.',
    recentConversations.length > 0 ? 'Revize dènye konvèsasyon yo pou follow-up.' : 'Ekri yon plan kout pou objektif jodi a.',
    'Bay apwobasyon sèlman pou aksyon ekstèn ou vle mwen prepare.'
  ];

  return actions.map((action, index) => `${index + 1}. ${action}`).join('\n');
}
