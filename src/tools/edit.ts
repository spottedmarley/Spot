// Edit tool - surgical file modifications via string replacement

import { resolve } from 'path';
import type { Tool, ToolContext } from './index.ts';

export const editTool: Tool = {
  name: 'edit_file',
  description: 'Edit a file by replacing a specific string with new content. Use this for surgical edits instead of rewriting entire files.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to edit (absolute or relative to cwd)',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace. Must match exactly including whitespace and indentation.',
      },
      new_string: {
        type: 'string',
        description: 'The string to replace it with. Use empty string to delete.',
      },
      replace_all: {
        type: 'boolean',
        description: 'If true, replace all occurrences. Default is false (replace first only).',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const path = params.path as string;
    const oldString = params.old_string as string;
    const newString = params.new_string as string;
    const replaceAll = (params.replace_all as boolean) || false;
    const cwd = context?.cwd || process.cwd();

    try {
      const fullPath = resolve(cwd, path);
      const file = Bun.file(fullPath);

      // Check file exists
      if (!(await file.exists())) {
        return `Error: File not found: ${fullPath}`;
      }

      // Read current content
      const content = await file.text();

      // Check if old_string exists
      if (!content.includes(oldString)) {
        // Provide helpful error with context
        const preview = oldString.length > 100
          ? oldString.slice(0, 100) + '...'
          : oldString;
        return `Error: String not found in file.\nSearched for:\n${preview}\n\nMake sure the string matches exactly, including whitespace and indentation.`;
      }

      // Check for uniqueness if not replacing all
      if (!replaceAll) {
        const occurrences = content.split(oldString).length - 1;
        if (occurrences > 1) {
          return `Error: Found ${occurrences} occurrences of the string. Either:\n1. Provide more context to make the match unique, or\n2. Set replace_all: true to replace all occurrences`;
        }
      }

      // Perform replacement
      let newContent: string;
      let replacementCount: number;

      if (replaceAll) {
        replacementCount = content.split(oldString).length - 1;
        newContent = content.split(oldString).join(newString);
      } else {
        replacementCount = 1;
        newContent = content.replace(oldString, newString);
      }

      // Write back
      await Bun.write(fullPath, newContent);

      // Generate summary
      const action = newString === ''
        ? 'Deleted'
        : oldString === ''
          ? 'Inserted'
          : 'Replaced';

      const summary = replaceAll && replacementCount > 1
        ? `${action} ${replacementCount} occurrences in ${path}`
        : `${action} text in ${path}`;

      return summary;
    } catch (error) {
      return `Error editing file: ${error}`;
    }
  },
};
