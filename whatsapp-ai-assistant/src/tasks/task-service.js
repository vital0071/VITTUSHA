import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_TASKS_FILE = join(process.cwd(), 'data', 'tasks.json');

export class TaskService {
  constructor({ filePath = process.env.VITTUSHA_TASKS_FILE ?? DEFAULT_TASKS_FILE } = {}) {
    this.filePath = filePath;
  }

  async createTask({ tenantId, userId, title }) {
    const store = await this.readStore();
    const now = new Date().toISOString();
    const task = {
      id: createTaskId(),
      tenantId,
      userId,
      title: title.trim(),
      status: 'pending',
      createdAt: now,
      completedAt: null
    };

    store.tasks.push(task);
    await this.writeStore(store);
    return task;
  }

  async listTasks({ tenantId, userId }) {
    const store = await this.readStore();
    return store.tasks
      .filter((task) => task.tenantId === tenantId && task.userId === userId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async completeTask({ tenantId, userId, title }) {
    const store = await this.readStore();
    const normalizedTitle = normalizeText(title);
    const task = store.tasks.find((item) => {
      if (item.tenantId !== tenantId || item.userId !== userId || item.status === 'completed') {
        return false;
      }

      const currentTitle = normalizeText(item.title);
      return currentTitle.includes(normalizedTitle) || normalizedTitle.includes(currentTitle);
    });

    if (!task) {
      return null;
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    await this.writeStore(store);
    return task;
  }

  async readStore() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { tasks: [] };
      }
      throw error;
    }
  }

  async writeStore(store) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }
}

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function createTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
