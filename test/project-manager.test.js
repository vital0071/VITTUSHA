import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectManager } from '../src/projects/ProjectManager.js';

function createLogger() {
  return {
    events: [],
    info(message, meta = {}) {
      this.events.push({ message, ...meta });
    },
    warn() {},
    error() {}
  };
}

function createProjectManager(logger = createLogger()) {
  return new ProjectManager({
    logger,
    state: {
      projectsByUser: new Map(),
      activeProjectByUser: new Map(),
      nextProjectId: 1
    }
  });
}

test('creates and lists projects for one user', async () => {
  const logger = createLogger();
  const manager = createProjectManager(logger);

  const project = await manager.createProject('user-1', 'KonekteW');
  const projects = await manager.listProjects('user-1');

  assert.equal(project.name, 'KonekteW');
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, 'KonekteW');
  assert.equal(logger.events.some((event) => event.message === 'project_created'), true);
});

test('sets and returns the active project', async () => {
  const logger = createLogger();
  const manager = createProjectManager(logger);

  const project = await manager.createProject('user-2', 'Vittusha AI');
  await manager.setActiveProject('user-2', project.id);
  const active = await manager.getActiveProject('user-2');

  assert.equal(active.name, 'Vittusha AI');
  assert.equal(logger.events.some((event) => event.message === 'active_project_set'), true);
});

test('handles set active project command variant', async () => {
  const manager = createProjectManager();

  const response = await manager.handleMessage({
    userId: 'user-variant',
    message: 'Mets ProSpace comme projet actif'
  });
  const active = await manager.getActiveProject('user-variant');

  assert.equal(response.answer, 'Projet actif défini : ProSpace.');
  assert.equal(active.name, 'ProSpace');
});

test('created project becomes active when no active project exists', async () => {
  const manager = createProjectManager();

  await manager.handleMessage({
    userId: 'user-created-active',
    message: 'Crée un projet appelé KonekteW.'
  });
  const response = await manager.handleMessage({
    userId: 'user-created-active',
    message: 'Quel est mon projet actif ?'
  });

  assert.match(response.answer, /KonekteW/);
  assert.equal(response.metadata.openaiCalled, false);
});

test('adds notes and builds project context', async () => {
  const logger = createLogger();
  const manager = createProjectManager(logger);

  const project = await manager.createProject('user-3', 'Vittusha AI');
  await manager.addProjectNote('user-3', project.id, 'créer le dashboard admin');
  const context = await manager.getProjectContext('user-3', project.id);

  assert.match(context.summary, /Vittusha AI/);
  assert.match(context.summary, /créer le dashboard admin/);
  assert.equal(logger.events.some((event) => event.message === 'project_note_added'), true);
  assert.equal(logger.events.some((event) => event.message === 'project_context_retrieved'), true);
});

test('handles French project intents without OpenAI', async () => {
  const logger = createLogger();
  const manager = createProjectManager(logger);

  const created = await manager.handleMessage({
    userId: 'user-4',
    message: 'Crée un projet appelé KonekteW'
  });
  const listed = await manager.handleMessage({
    userId: 'user-4',
    message: 'Quels sont mes projets ?'
  });

  assert.equal(created.answer, 'Projet "KonekteW" créé.');
  assert.match(listed.answer, /KonekteW/);
  assert.equal(created.metadata.openaiCalled, false);
  assert.equal(logger.events.some((event) => event.message === 'project_intent_detected'), true);
});
