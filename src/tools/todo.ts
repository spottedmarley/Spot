// Todo management tool

import type { Tool, ToolContext } from './index.ts';

export const todoTool: Tool = {
  name: 'todo',
  description: 'Manage a task list to track work. Use this to plan multi-step tasks, track progress, and stay organized.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The action to perform: list, add, start, complete, remove, clear_completed',
        enum: ['list', 'add', 'start', 'complete', 'remove', 'clear_completed'],
      },
      content: {
        type: 'string',
        description: 'Task description (required for "add" action)',
      },
      id: {
        type: 'string',
        description: 'Task ID (required for "start", "complete", "remove" actions)',
      },
    },
    required: ['action'],
  },

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<string> {
    if (!context?.session) {
      return 'Error: Todo tool requires session context';
    }

    const action = params.action as string;
    const content = params.content as string | undefined;
    const id = params.id as string | undefined;

    switch (action) {
      case 'list': {
        const todos = context.session.getTodos();
        if (todos.length === 0) {
          return 'No tasks in the list.';
        }
        const lines = todos.map(t => {
          const status = t.status === 'completed' ? '[x]' :
                         t.status === 'in_progress' ? '[>]' : '[ ]';
          return `${status} ${t.content} (id: ${t.id})`;
        });
        return `Tasks:\n${lines.join('\n')}`;
      }

      case 'add': {
        if (!content) {
          return 'Error: "content" is required for add action';
        }
        const task = context.session.addTodo(content);
        return `Added task: ${task.content} (id: ${task.id})`;
      }

      case 'start': {
        if (!id) {
          return 'Error: "id" is required for start action';
        }
        const success = context.session.updateTodo(id, 'in_progress');
        if (success) {
          return `Task ${id} marked as in progress`;
        }
        return `Error: Task ${id} not found`;
      }

      case 'complete': {
        if (!id) {
          return 'Error: "id" is required for complete action';
        }
        const success = context.session.updateTodo(id, 'completed');
        if (success) {
          return `Task ${id} marked as completed`;
        }
        return `Error: Task ${id} not found`;
      }

      case 'remove': {
        if (!id) {
          return 'Error: "id" is required for remove action';
        }
        const success = context.session.removeTodo(id);
        if (success) {
          return `Task ${id} removed`;
        }
        return `Error: Task ${id} not found`;
      }

      case 'clear_completed': {
        const count = context.session.clearCompletedTodos();
        return `Cleared ${count} completed task(s)`;
      }

      default:
        return `Error: Unknown action "${action}". Use: list, add, start, complete, remove, clear_completed`;
    }
  },
};
