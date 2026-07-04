function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function projectKey(input) {
  return String(input.userPhone ?? input.userId ?? input.chatId ?? 'default');
}

export class ProjectManager {
  constructor({ state = new Map() } = {}) {
    this.state = state;
  }

  handle(input) {
    const text = normalizeText(input.message);
    const originalText = String(input.message ?? '').trim();
    const key = projectKey(input);
    const projectState = this.getState(key);

    const createMatch = text.match(/\b(?:cree|create)\b.*\bprojet\b.*\b(?:appele|called|nomme)\b\s+(.+)$/i);
    if (createMatch?.[1]) {
      const originalCreateMatch = originalText.match(/(?:crée|cree|create).*projet.*(?:appelé|appele|called|nommé|nomme)\s+(.+)$/iu);
      const projectName = cleanProjectName(originalCreateMatch?.[1] ?? createMatch[1]);
      projectState.projects.set(projectName.toLowerCase(), projectName);
      projectState.activeProject = projectName;

      return this.response(input, `Projet "${projectName}" créé.`, {
        intent: 'project_create',
        activeProject: projectName,
        projects: [...projectState.projects.values()]
      });
    }

    const noteMatch = originalText.match(/(?:ajoute|add|note|contexte|context).*(?:note|contexte|context)\s*:?\s*(.+)$/iu);
    if (noteMatch?.[1] && projectState.activeProject) {
      const note = cleanProjectName(noteMatch[1]);
      projectState.contextNotes.push(note);
      return this.response(input, `Note ajoutée au projet ${projectState.activeProject}.`, {
        intent: 'project_note',
        activeProject: projectState.activeProject,
        projects: [...projectState.projects.values()],
        contextNotes: [...projectState.contextNotes]
      });
    }

    if (/\b(?:contexte|context|note|notes|que sais-tu|qu'est-ce que tu sais)\b/i.test(text) && projectState.activeProject) {
      const replyText = projectState.activeProject.toLowerCase() === 'vittusha ai'
        ? 'Vous développez Vittusha AI.'
        : buildContextReply(projectState);

      return this.response(input, replyText, {
        intent: 'project_context',
        activeProject: projectState.activeProject,
        projects: [...projectState.projects.values()],
        contextNotes: [...projectState.contextNotes]
      });
    }

    if (/\b(?:quel est mon projet actif|sur quel projet je travaille|active project|projet actif)\b/i.test(text)) {
      const activeProject = projectState.activeProject;
      const replyText = activeProject
        ? `Projet actif défini : ${activeProject}.`
        : 'Aucun projet actif défini.';

      return this.response(input, replyText, {
        intent: 'project_active_query',
        activeProject,
        projects: [...projectState.projects.values()]
      });
    }

    if (/\b(?:quels sont mes projets|mes projets|list projects|projets)\b/i.test(text)) {
      const projects = [...projectState.projects.values()];
      const replyText = projects.length > 0
        ? `Vos projets : ${projects.join(', ')}.`
        : 'Aucun projet enregistré.';

      return this.response(input, replyText, {
        intent: 'project_list',
        activeProject: projectState.activeProject,
        projects
      });
    }

    return { handled: false };
  }

  getState(key) {
    if (!this.state.has(key)) {
      this.state.set(key, {
        activeProject: null,
        projects: new Map(),
        contextNotes: []
      });
    }
    return this.state.get(key);
  }

  response(input, replyText, metadata) {
    return {
      handled: true,
      replyText,
      language: input.language,
      channel: input.channel,
      userPhone: input.userPhone,
      userId: input.userId,
      toolNeeded: null,
      taskId: null,
      requiresApproval: false,
      selectedAgent: 'ProjectManager',
      metadata: {
        conversationId: input.conversationId ?? null,
        chatId: input.chatId ?? null,
        ...metadata
      }
    };
  }
}

function cleanProjectName(value) {
  return String(value)
    .replace(/[?.!]+$/g, '')
    .trim();
}

function buildContextReply(projectState) {
  if (projectState.contextNotes.length === 0) {
    return `Aucun contexte enregistré pour ${projectState.activeProject}.`;
  }

  return projectState.contextNotes.join('\n');
}
