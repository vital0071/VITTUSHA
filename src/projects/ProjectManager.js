const projectState = {
  projectsByUser: new Map(),
  activeProjectByUser: new Map(),
  nextProjectId: 1
};

export class ProjectManager {
  constructor({ logger, state = projectState } = {}) {
    this.logger = logger;
    this.state = state;
  }

  async createProject(userId, name, description = '') {
    const project = {
      id: String(this.state.nextProjectId++),
      userId: String(userId),
      name: cleanName(name),
      description: String(description || '').trim(),
      notes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const projects = this.getUserProjects(userId);
    const existing = findProjectByName(projects, project.name);
    if (existing) {
      if (!await this.getActiveProject(userId)) {
        await this.setActiveProject(userId, existing.id);
      }
      return existing;
    }

    this.state.projectsByUser.set(String(userId), [...projects, project]);
    this.logger?.info('project_created', {
      userId: String(userId),
      projectId: project.id,
      name: project.name
    });
    this.logger?.info('project_manager_fallback', {
      provider: 'json',
      operation: 'createProject'
    });
    if (!await this.getActiveProject(userId)) {
      await this.setActiveProject(userId, project.id);
    }
    return project;
  }

  async listProjects(userId) {
    return this.getUserProjects(userId);
  }

  async getActiveProject(userId) {
    const activeId = this.state.activeProjectByUser.get(String(userId));
    if (!activeId) {
      return null;
    }
    return this.getUserProjects(userId).find((project) => project.id === activeId) ?? null;
  }

  async setActiveProject(userId, projectId) {
    const projects = this.getUserProjects(userId);
    const project = projects.find((item) => item.id === String(projectId));
    if (!project) {
      return null;
    }
    this.state.activeProjectByUser.set(String(userId), project.id);
    this.logger?.info('active_project_set', {
      userId: String(userId),
      projectId: project.id,
      name: project.name
    });
    this.logger?.info('project_manager_fallback', {
      provider: 'json',
      operation: 'setActiveProject'
    });
    return project;
  }

  async setActiveProjectByName(userId, name) {
    const clean = cleanName(name);
    const projects = this.getUserProjects(userId);
    const existing = findProjectByName(projects, clean) ?? await this.createProject(userId, clean);
    return this.setActiveProject(userId, existing.id);
  }

  async addProjectNote(userId, projectId, note) {
    const projects = this.getUserProjects(userId);
    const project = projects.find((item) => item.id === String(projectId));
    if (!project) {
      return null;
    }
    const entry = {
      id: String(project.notes.length + 1),
      note: String(note || '').trim(),
      createdAt: new Date().toISOString()
    };
    project.notes.push(entry);
    project.updatedAt = new Date().toISOString();
    this.state.projectsByUser.set(String(userId), projects);
    this.logger?.info('project_note_added', {
      userId: String(userId),
      projectId: project.id,
      name: project.name
    });
    this.logger?.info('project_manager_fallback', {
      provider: 'json',
      operation: 'addProjectNote'
    });
    return entry;
  }

  async addProjectNoteByName(userId, name, note) {
    const clean = cleanName(name);
    const projects = this.getUserProjects(userId);
    const project = findProjectByName(projects, clean) ?? await this.createProject(userId, clean);
    return this.addProjectNote(userId, project.id, note);
  }

  async getProjectContext(userId, projectId) {
    const project = this.getUserProjects(userId).find((item) => item.id === String(projectId));
    if (!project) {
      return null;
    }
    this.logger?.info('project_context_retrieved', {
      userId: String(userId),
      projectId: project.id,
      name: project.name,
      noteCount: project.notes.length
    });
    return {
      project,
      summary: buildProjectSummary(project)
    };
  }

  async getProjectContextByName(userId, name) {
    const project = findProjectByName(this.getUserProjects(userId), cleanName(name));
    if (!project) {
      return null;
    }
    return this.getProjectContext(userId, project.id);
  }

  async handleMessage({ userId, message, memoryContext = null }) {
    const intent = detectProjectIntent(message);
    if (!intent) {
      return null;
    }

    this.logger?.info('project_intent_detected', {
      userId: String(userId),
      intent: intent.type
    });

    if (intent.type === 'create_project') {
      const project = await this.createProject(userId, intent.name, intent.description);
      return buildProjectResponse(`Projet "${project.name}" créé.`, intent.type, { project });
    }

    if (intent.type === 'set_active_project') {
      const project = await this.setActiveProjectByName(userId, intent.name);
      return buildProjectResponse(`Projet actif défini : ${project.name}.`, intent.type, { project });
    }

    if (intent.type === 'list_projects') {
      const projects = await this.listProjects(userId);
      if (projects.length === 0) {
        return buildProjectResponse('Aucun projet enregistré. Quel projet veux-tu créer ?', intent.type);
      }
      return buildProjectResponse(`Vos projets : ${projects.map((project) => project.name).join(', ')}.`, intent.type, { projects });
    }

    if (intent.type === 'active_project_question') {
      const project = await this.getActiveProject(userId);
      if (project) {
        return buildProjectResponse(`Vous travaillez sur ${project.name}.`, intent.type, { project });
      }
      if (hasProjectMemory(memoryContext)) {
        return null;
      }
      return buildProjectResponse('Quel projet dois-je définir comme projet actif ?', intent.type);
    }

    if (intent.type === 'add_project_note') {
      const note = await this.addProjectNoteByName(userId, intent.name, intent.note);
      return buildProjectResponse(`Note ajoutée au projet ${cleanName(intent.name)}.`, intent.type, { note });
    }

    if (intent.type === 'project_context_question') {
      const context = await this.getProjectContextByName(userId, intent.name);
      if (!context) {
        return buildProjectResponse(`Je n'ai pas encore d'information sur le projet ${cleanName(intent.name)}.`, intent.type);
      }
      return buildProjectResponse(context.summary, intent.type, { project: context.project });
    }

    return null;
  }

  getUserProjects(userId) {
    return this.state.projectsByUser.get(String(userId)) ?? [];
  }
}

function detectProjectIntent(message = '') {
  const text = String(message).trim();

  const createMatch = text.match(/\bcr[eéè]e?\s+(?:un\s+)?projet\s+(?:appel[eéè]|nomm[eéè])\s+(.+?)(?:\s*:\s*(.+))?$/i);
  if (createMatch) {
    return {
      type: 'create_project',
      name: createMatch[1],
      description: createMatch[2] ?? ''
    };
  }

  const activeMatch = text.match(/\b(?:mon\s+projet\s+actif\s+est|mets\s+(.+?)\s+comme\s+projet\s+actif)\s*(.+)?$/i);
  if (activeMatch) {
    return {
      type: 'set_active_project',
      name: activeMatch[1] ?? activeMatch[2]
    };
  }

  const noteMatch = text.match(/\bajoute\s+une\s+note\s+au\s+projet\s+(.+?)\s*:\s*(.+)$/i);
  if (noteMatch) {
    return {
      type: 'add_project_note',
      name: noteMatch[1],
      note: noteMatch[2]
    };
  }

  if (/\bquels\s+sont\s+mes\s+projets\s*\??$/i.test(text)) {
    return { type: 'list_projects' };
  }

  if (/\bsur\s+quel\s+projet\s+je\s+travaille\s*\??$/i.test(text) || /\bquel\s+est\s+mon\s+projet\s+actif\s*\??$/i.test(text)) {
    return { type: 'active_project_question' };
  }

  const contextMatch = text.match(/\bque\s+sais-tu\s+sur\s+le\s+projet\s+(.+?)\s*\??$/i);
  if (contextMatch) {
    return {
      type: 'project_context_question',
      name: contextMatch[1]
    };
  }

  return null;
}

function cleanName(value = '') {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/^["':-]+|["'.?:-]+$/g, '')
    .trim();
}

function findProjectByName(projects, name) {
  const target = cleanName(name).toLowerCase();
  return projects.find((project) => project.name.toLowerCase() === target) ?? null;
}

function hasProjectMemory(memoryContext) {
  return (memoryContext?.relevantMemories ?? []).some((memory) => memory.type === 'PROJECT');
}

function buildProjectSummary(project) {
  const description = project.description ? ` Description : ${project.description}.` : '';
  const notes = project.notes.length > 0
    ? ` Notes : ${project.notes.map((entry) => entry.note).join('; ')}.`
    : ' Aucune note enregistrée.';
  return `Projet ${project.name}.${description}${notes}`;
}

function buildProjectResponse(answer, intent, metadata = {}) {
  return {
    answer,
    intent,
    actions: {
      projectIntent: intent
    },
    metadata: {
      responseSource: 'project_manager',
      openaiCalled: false,
      ...metadata
    }
  };
}
