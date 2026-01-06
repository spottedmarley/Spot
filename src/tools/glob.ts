import { spawn } from 'child_process';
import type { Tool, ToolContext } from './index.ts';

export const globTool: Tool = {
  name: 'glob',
  description: 'List or find files. Use pattern "*" to list all files in a directory, or "**/*.ext" to find by extension.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Pattern: "*" for all files, "*.ts" for .ts files, "**/*.js" for recursive search',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: current directory)',
      },
    },
    required: ['pattern'],
  },

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const pattern = params.pattern as string;
    const searchPath = (params.path as string) || '.';
    const cwd = context?.cwd || process.cwd();

    return new Promise((resolve) => {
      // Use find with shell globbing
      const proc = spawn('bash', ['-c', `shopt -s globstar nullglob; cd "${searchPath}" && ls -d ${pattern} 2>/dev/null | head -100`], {
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

      proc.on('close', () => {
        const files = stdout.trim().split('\n').filter(f => f);
        if (files.length === 0) {
          resolve(`No files found matching pattern: ${pattern}`);
        } else {
          resolve(`Found ${files.length} file(s):\n${files.join('\n')}`);
        }
      });

      proc.on('error', (error) => {
        resolve(`Error searching for files: ${error.message}`);
      });
    });
  },
};
