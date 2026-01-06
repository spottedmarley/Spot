import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import type { Tool, ToolContext } from './index.ts';

export const writeTool: Tool = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to write (absolute or relative to cwd)',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['path', 'content'],
  },

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const path = params.path as string;
    const content = params.content as string;
    const cwd = context?.cwd || process.cwd();

    try {
      const fullPath = resolve(cwd, path);

      // Ensure directory exists
      await mkdir(dirname(fullPath), { recursive: true });

      await writeFile(fullPath, content, 'utf-8');

      const lines = content.split('\n').length;
      return `Successfully wrote ${lines} lines to ${fullPath}`;
    } catch (error) {
      return `Error writing file: ${error}`;
    }
  },
};
