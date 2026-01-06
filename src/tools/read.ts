import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Tool, ToolContext } from './index.ts';

export const readTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the file content with line numbers.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to read (absolute or relative to cwd)',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-indexed, optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read (optional)',
      },
    },
    required: ['path'],
  },

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const path = params.path as string;
    const offset = (params.offset as number) || 1;
    const limit = params.limit as number | undefined;
    const cwd = context?.cwd || process.cwd();

    try {
      const fullPath = resolve(cwd, path);
      const content = await readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      const startIdx = Math.max(0, offset - 1);
      const endIdx = limit ? startIdx + limit : lines.length;
      const selectedLines = lines.slice(startIdx, endIdx);

      // Format with line numbers
      const numbered = selectedLines.map((line, i) => {
        const lineNum = startIdx + i + 1;
        return `${lineNum.toString().padStart(6)}│ ${line}`;
      }).join('\n');

      return `File: ${fullPath}\n${'─'.repeat(60)}\n${numbered}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `Error: File not found: ${path}`;
      }
      return `Error reading file: ${error}`;
    }
  },
};
