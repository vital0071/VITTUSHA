import { detectNeededTool, getTool, listTools } from './registry.js';

export class ToolRegistry {
  listTools() {
    return listTools();
  }

  getTool(name) {
    return getTool(name);
  }

  detectNeededTool(message) {
    return detectNeededTool(message);
  }
}
