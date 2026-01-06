import { spawn } from 'child_process';
import type { Tool, ToolContext } from './index.ts';

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search for a pattern in files. Uses ripgrep (rg) if available, falls back to grep.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in (default: current directory)',
      },
      type: {
        type: 'string',
        description: 'File type to search (e.g., "ts", "js", "py")',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Whether the search is case sensitive (default: false)',
      },
    },
    required: ['pattern'],
  },

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const pattern = params.pattern as string;
    const searchPath = (params.path as string) || '.';
    const fileType = params.type as string | undefined;
    const caseSensitive = params.caseSensitive as boolean ?? false;
    const cwd = context?.cwd || process.cwd();

    return new Promise((resolve) => {
      // Build rg command
      const args = ['--line-number', '--color=never'];

      if (!caseSensitive) {
        args.push('-i');
      }

      if (fileType) {
        args.push('-t', fileType);
      }

      args.push(pattern, searchPath);

      // Try rg first, fall back to grep
      let cmd = 'rg';
      let cmdArgs = args;

      const proc = spawn(cmd, cmdArgs, {
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
        if (stderr.includes('command not found') || stderr.includes('No such file')) {
          resolve(`Error: ${stderr}`);
          return;
        }

        const lines = stdout.trim().split('\n').filter(l => l);
        if (lines.length === 0) {
          resolve(`No matches found for pattern: ${pattern}`);
        } else {
          // Limit output
          const maxLines = 50;
          const truncated = lines.length > maxLines;
          const output = lines.slice(0, maxLines).join('\n');
          resolve(`Found ${lines.length} match(es):\n${output}${truncated ? `\n... (${lines.length - maxLines} more matches)` : ''}`);
        }
      });

      proc.on('error', () => {
        // rg not found, try grep
        const grepProc = spawn('grep', ['-rn', caseSensitive ? '' : '-i', pattern, searchPath].filter(a => a), {
          cwd,
        });

        stdout = '';
        grepProc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        grepProc.on('close', () => {
          const lines = stdout.trim().split('\n').filter(l => l);
          if (lines.length === 0) {
            resolve(`No matches found for pattern: ${pattern}`);
          } else {
            const maxLines = 50;
            const truncated = lines.length > maxLines;
            const output = lines.slice(0, maxLines).join('\n');
            resolve(`Found ${lines.length} match(es):\n${output}${truncated ? `\n... (${lines.length - maxLines} more matches)` : ''}`);
          }
        });
      });
    });
  },
};
