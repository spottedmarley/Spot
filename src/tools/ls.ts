import { spawn } from 'child_process';
import type { Tool, ToolContext } from './index.ts';

export const lsTool: Tool = {
  name: 'ls',
  description: 'List contents of a directory. Shows files and folders with details.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory to list (default: current directory)',
      },
    },
    required: [],
  },

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const path = (params.path as string) || '.';
    const cwd = context?.cwd || process.cwd();

    return new Promise((resolve) => {
      const proc = spawn('ls', ['-la', path], {
        cwd,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 || stderr) {
          resolve(`Error: ${stderr || 'Failed to list directory'}`);
        } else {
          resolve(stdout.trim());
        }
      });

      proc.on('error', (error) => {
        resolve(`Error: ${error.message}`);
      });
    });
  },
};
