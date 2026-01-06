// Tool System for Spot

import type { SessionManager } from '../session/index.ts';

// Context passed to tools that need it
export interface ToolContext {
  session: SessionManager;
  cwd: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  // Context is optional for backwards compatibility
  execute: (params: Record<string, unknown>, context?: ToolContext) => Promise<string>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// Export all tools
export { readTool } from './read.ts';
export { writeTool } from './write.ts';
export { bashTool } from './bash.ts';
export { globTool } from './glob.ts';
export { grepTool } from './grep.ts';
export { lsTool } from './ls.ts';
export { todoTool } from './todo.ts';
export { editTool } from './edit.ts';

import { readTool } from './read.ts';
import { writeTool } from './write.ts';
import { editTool } from './edit.ts';
import { bashTool } from './bash.ts';
import { globTool } from './glob.ts';
import { grepTool } from './grep.ts';
import { lsTool } from './ls.ts';
import { todoTool } from './todo.ts';

export const allTools: Tool[] = [
  lsTool,
  readTool,
  writeTool,
  editTool,
  bashTool,
  globTool,
  grepTool,
  todoTool,
];

export function getToolByName(name: string): Tool | undefined {
  return allTools.find(t => t.name === name);
}

export function getToolDefinitions(): object[] {
  return allTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
