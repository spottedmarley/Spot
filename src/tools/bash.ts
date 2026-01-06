import { spawn } from 'child_process';
import type { Tool } from './index.ts';

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a bash command and return its output. Use this for system commands, git, npm, etc.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  },

  async execute(params: Record<string, unknown>): Promise<string> {
    const command = params.command as string;
    const timeout = (params.timeout as number) || 30000;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn('bash', ['-c', command], {
        cwd: process.cwd(),
        env: process.env,
      });

      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);

        let result = '';
        if (stdout) {
          result += `stdout:\n${stdout}`;
        }
        if (stderr) {
          result += `${stdout ? '\n' : ''}stderr:\n${stderr}`;
        }
        if (killed) {
          result += `\n(Command timed out after ${timeout}ms)`;
        }
        if (code !== 0 && code !== null) {
          result += `\n(Exit code: ${code})`;
        }

        resolve(result || '(No output)');
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        resolve(`Error executing command: ${error.message}`);
      });
    });
  },
};
