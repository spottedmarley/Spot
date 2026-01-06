import * as readline from 'readline';
import { OllamaClient, type ChatMessage } from './ollama-client.ts';
import { config } from './config.ts';
import { allTools, type ToolContext } from './tools/index.ts';
import { select } from './select.ts';
import { SessionManager } from './session/index.ts';
import { detectProject, formatProjectContext, type ProjectContext } from './project/index.ts';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
};

const BASE_SYSTEM_PROMPT = `You are Spot, a local AI assistant for coding and Linux system tasks.

## Response Style
Match your response length to the complexity of the request:
- Simple question → simple answer (1-2 sentences)
- Task request → acknowledge briefly, then do it
- Complex question → explain what's needed, but stay focused

Do NOT:
- Provide examples unless asked ("Can you write JS?" → "Yes, I can." not "Yes, here's a demo...")
- Explain capabilities hypothetically - either answer or act
- Add disclaimers, caveats, or "let me know if you need anything else"
- Pad responses with unnecessary context

Do:
- Answer directly and naturally
- When doing tasks, briefly state what you're doing, then do it
- Use tools to actually perform actions rather than describing what you would do
- Be helpful and conversational, just not verbose

## Tools
You have these tools: ${allTools.map(t => t.name).join(', ')}

When the user asks you to DO something (read a file, run a command, find something), use the appropriate tool. Output the tool call as JSON:
{"name": "tool_name", "arguments": {"param": "value"}}
`;

export class Repl {
  private client: OllamaClient;
  private session: SessionManager;
  private project: ProjectContext | null = null;
  private rl: readline.Interface;

  constructor() {
    this.client = new OllamaClient();
    this.session = new SessionManager(process.cwd(), config.sessionsDir);

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private print(text: string): void {
    process.stdout.write(text);
  }

  private println(text: string = ''): void {
    console.log(text);
  }

  private printHeader(): void {
    this.println();
    this.println(`${colors.cyan}${colors.bright}  ╭─────────────────────────────────────╮${colors.reset}`);
    this.println(`${colors.cyan}${colors.bright}  │${colors.reset}  ${colors.green}${colors.bright}Spot${colors.reset} - Local AI Agent              ${colors.cyan}${colors.bright}│${colors.reset}`);
    this.println(`${colors.cyan}${colors.bright}  │${colors.reset}  ${colors.dim}Model: ${config.primaryModel}${colors.reset}  ${colors.cyan}${colors.bright}│${colors.reset}`);
    this.println(`${colors.cyan}${colors.bright}  ╰─────────────────────────────────────╯${colors.reset}`);
    this.println();
    this.println(`${colors.dim}  Commands: /quit /clear /model /session /project /todo /help${colors.reset}`);
    this.println();
  }

  private formatToolArgs(args: Record<string, unknown>): string {
    const entries = Object.entries(args);
    if (entries.length === 0) return '';
    if (entries.length === 1) {
      const [key, value] = entries[0]!;
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      return strValue.length > 50 ? strValue.slice(0, 50) + '...' : strValue;
    }
    return JSON.stringify(args).slice(0, 60) + '...';
  }

  private async handleCommand(input: string): Promise<boolean> {
    const parts = input.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();

    switch (command) {
      case '/quit':
      case '/exit':
        // Save session before exiting
        await this.session.save();
        this.println(`${colors.dim}Session saved. Goodbye!${colors.reset}`);
        return false;

      case '/clear':
        this.session.clear();
        this.println(`${colors.green}✓ Conversation cleared${colors.reset}`);
        return true;

      case '/model':
        if (parts[1]) {
          this.client.setModel(parts[1]);
          this.session.setModel(parts[1]);
          this.println(`${colors.green}✓ Switched to: ${parts[1]}${colors.reset}`);
        } else {
          const models = await this.client.listModels();
          const currentModel = this.client.getModel();
          const currentIndex = models.indexOf(currentModel);

          const selected = await select('Select model:', models, currentIndex >= 0 ? currentIndex : 0);

          if (selected) {
            this.client.setModel(selected);
            this.session.setModel(selected);
            this.println(`${colors.green}✓ Switched to: ${selected}${colors.reset}`);
          } else {
            this.println(`${colors.dim}Cancelled${colors.reset}`);
          }
        }
        return true;

      case '/session':
        await this.handleSessionCommand(parts.slice(1));
        return true;

      case '/project':
        await this.handleProjectCommand(parts.slice(1));
        return true;

      case '/todo':
        await this.handleTodoCommand(parts.slice(1));
        return true;

      case '/tools':
        this.println(`${colors.cyan}Available tools:${colors.reset}`);
        allTools.forEach(t => {
          this.println(`  ${colors.yellow}${t.name}${colors.reset}: ${t.description}`);
        });
        return true;

      case '/help':
        this.println(`${colors.cyan}Commands:${colors.reset}`);
        this.println(`  /quit, /exit      - Exit Spot (saves session)`);
        this.println(`  /clear            - Clear conversation`);
        this.println(`  /model [name]     - List or switch models`);
        this.println(`  /session          - Show session info`);
        this.println(`  /session new      - Archive current, start fresh`);
        this.println(`  /session list     - List archived sessions`);
        this.println(`  /session load <id>- Load an archived session`);
        this.println(`  /project          - Show detected project info`);
        this.println(`  /project reload   - Re-detect project context`);
        this.println(`  /todo             - List current tasks`);
        this.println(`  /todo add <task>  - Add a new task`);
        this.println(`  /todo done <id>   - Mark task as completed`);
        this.println(`  /todo rm <id>     - Remove a task`);
        this.println(`  /tools            - List available tools`);
        return true;

      default:
        this.println(`${colors.yellow}Unknown command. Type /help for available commands.${colors.reset}`);
        return true;
    }
  }

  private async handleSessionCommand(args: string[]): Promise<void> {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case 'new':
        const archivePath = await this.session.archive();
        this.println(`${colors.green}✓ Session archived${colors.reset}`);
        this.println(`${colors.dim}  Saved to: ${archivePath}${colors.reset}`);
        this.println(`${colors.green}✓ Started new session${colors.reset}`);
        break;

      case 'list':
        const archived = await this.session.listArchived();
        if (archived.length === 0) {
          this.println(`${colors.dim}No archived sessions${colors.reset}`);
        } else {
          this.println(`${colors.cyan}Archived sessions:${colors.reset}`);
          for (const s of archived) {
            const date = new Date(s.updated).toLocaleDateString();
            const time = new Date(s.updated).toLocaleTimeString();
            this.println(`  ${colors.yellow}${s.id.slice(0, 8)}${colors.reset} - ${s.messageCount} messages - ${date} ${time}`);
          }
        }
        break;

      case 'load':
        const sessionId = args[1];
        if (!sessionId) {
          this.println(`${colors.yellow}Usage: /session load <id>${colors.reset}`);
          return;
        }
        const loaded = await this.session.loadArchived(sessionId);
        if (loaded) {
          // Sync model with loaded session
          this.client.setModel(this.session.getModel());
          this.println(`${colors.green}✓ Session loaded${colors.reset}`);
        } else {
          this.println(`${colors.red}Session not found: ${sessionId}${colors.reset}`);
        }
        break;

      default:
        // Show current session info
        const info = this.session.getInfo();
        this.println(`${colors.cyan}Current session:${colors.reset}`);
        this.println(`  ID: ${colors.yellow}${info.id}${colors.reset}`);
        this.println(`  Messages: ${info.messageCount}`);
        this.println(`  Summarized: ${info.hasSummary ? 'yes' : 'no'}`);
        this.println(`  Created: ${info.created.toLocaleString()}`);
        this.println(`  Updated: ${info.updated.toLocaleString()}`);
        break;
    }
  }

  private async handleProjectCommand(args: string[]): Promise<void> {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case 'reload':
        this.project = await detectProject(process.cwd());
        this.println(`${colors.green}✓ Project context reloaded${colors.reset}`);
        this.printProjectInfo();
        break;

      default:
        this.printProjectInfo();
        break;
    }
  }

  private async handleTodoCommand(args: string[]): Promise<void> {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case 'add': {
        const content = args.slice(1).join(' ');
        if (!content) {
          this.println(`${colors.yellow}Usage: /todo add <task description>${colors.reset}`);
          return;
        }
        const task = this.session.addTodo(content);
        this.println(`${colors.green}✓ Added:${colors.reset} ${task.content} ${colors.dim}(${task.id})${colors.reset}`);
        break;
      }

      case 'done':
      case 'complete': {
        const id = args[1];
        if (!id) {
          this.println(`${colors.yellow}Usage: /todo done <id>${colors.reset}`);
          return;
        }
        if (this.session.updateTodo(id, 'completed')) {
          this.println(`${colors.green}✓ Completed:${colors.reset} ${id}`);
        } else {
          this.println(`${colors.red}Task not found: ${id}${colors.reset}`);
        }
        break;
      }

      case 'start': {
        const id = args[1];
        if (!id) {
          this.println(`${colors.yellow}Usage: /todo start <id>${colors.reset}`);
          return;
        }
        if (this.session.updateTodo(id, 'in_progress')) {
          this.println(`${colors.green}✓ Started:${colors.reset} ${id}`);
        } else {
          this.println(`${colors.red}Task not found: ${id}${colors.reset}`);
        }
        break;
      }

      case 'rm':
      case 'remove': {
        const id = args[1];
        if (!id) {
          this.println(`${colors.yellow}Usage: /todo rm <id>${colors.reset}`);
          return;
        }
        if (this.session.removeTodo(id)) {
          this.println(`${colors.green}✓ Removed:${colors.reset} ${id}`);
        } else {
          this.println(`${colors.red}Task not found: ${id}${colors.reset}`);
        }
        break;
      }

      case 'clear': {
        const count = this.session.clearCompletedTodos();
        this.println(`${colors.green}✓ Cleared ${count} completed task(s)${colors.reset}`);
        break;
      }

      default:
        // List todos
        this.printTodos();
        break;
    }
  }

  private printTodos(): void {
    const todos = this.session.getTodos();
    if (todos.length === 0) {
      this.println(`${colors.dim}No tasks${colors.reset}`);
      return;
    }

    this.println(`${colors.cyan}Tasks:${colors.reset}`);
    for (const t of todos) {
      const icon = t.status === 'completed' ? `${colors.green}✓${colors.reset}` :
                   t.status === 'in_progress' ? `${colors.yellow}→${colors.reset}` :
                   `${colors.dim}○${colors.reset}`;
      const style = t.status === 'completed' ? colors.dim : '';
      this.println(`  ${icon} ${style}${t.content}${colors.reset} ${colors.dim}(${t.id})${colors.reset}`);
    }
  }

  private printProjectInfo(): void {
    if (!this.project) {
      this.println(`${colors.dim}No project detected${colors.reset}`);
      return;
    }

    this.println(`${colors.cyan}Project:${colors.reset}`);
    this.println(`  Name: ${colors.yellow}${this.project.name}${colors.reset}`);
    this.println(`  Root: ${this.project.root}`);

    if (this.project.gitRepo) {
      this.println(`  Git: ${colors.green}yes${colors.reset}${this.project.gitBranch ? ` (${this.project.gitBranch})` : ''}`);
    }

    if (this.project.techStack.length > 0) {
      const stack = this.project.techStack.map(s => s.name).join(', ');
      this.println(`  Stack: ${stack}`);
    }

    if (this.project.instructions) {
      const lines = this.project.instructions.split('\n').length;
      this.println(`  SPOT.md: ${colors.green}loaded${colors.reset} (${lines} lines)`);
    } else {
      this.println(`  SPOT.md: ${colors.dim}not found${colors.reset}`);
    }
  }

  private prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(`${colors.green}${colors.bright}>${colors.reset} `, (answer) => {
        resolve(answer);
      });
    });
  }

  // Build full system prompt with project context
  private buildSystemPrompt(): string {
    let prompt = BASE_SYSTEM_PROMPT;

    // Add project context
    if (this.project) {
      prompt += '\n' + formatProjectContext(this.project);
    } else {
      prompt += `\n## Environment\nWorking directory: ${process.cwd()}`;
    }

    // Add todos if any
    const todosSection = this.session.formatTodosForPrompt();
    if (todosSection) {
      prompt += '\n' + todosSection;
    }

    return prompt;
  }

  // Convert session messages to ChatMessage format for ollama-client
  private getMessagesForModel(): ChatMessage[] {
    const systemPrompt = this.buildSystemPrompt();
    const contextMessages = this.session.getContextMessages(systemPrompt);

    return contextMessages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  async run(): Promise<void> {
    // Detect project context
    this.project = await detectProject(process.cwd());

    // Try to load existing session
    const loaded = await this.session.load();
    if (loaded) {
      // Sync model with session
      this.client.setModel(this.session.getModel());
    }

    this.printHeader();

    // Show project info if detected
    if (this.project.instructions) {
      this.println(`${colors.dim}  Project: ${this.project.name} (SPOT.md loaded)${colors.reset}`);
    } else if (this.project.root !== process.cwd()) {
      this.println(`${colors.dim}  Project: ${this.project.name}${colors.reset}`);
    }

    if (loaded) {
      const info = this.session.getInfo();
      this.println(`${colors.dim}  Resumed session (${info.messageCount} messages)${colors.reset}`);
    }

    if (this.project.instructions || loaded) {
      this.println();
    }

    while (true) {
      const input = await this.prompt();

      if (!input.trim()) {
        continue;
      }

      // Handle commands
      if (input.startsWith('/')) {
        const shouldContinue = await this.handleCommand(input);
        if (!shouldContinue) {
          break;
        }
        continue;
      }

      // Add user message to session
      this.session.addMessage('user', input);

      // Get response with streaming
      this.println();
      this.print(`${colors.cyan}Spot:${colors.reset} `);

      try {
        // Get messages in format for model
        const messages = this.getMessagesForModel();

        // Build tool context
        const toolContext: ToolContext = {
          session: this.session,
          cwd: process.cwd(),
        };

        const response = await this.client.chat(messages, {
          onToken: (token) => {
            this.print(token);
          },
          onToolCall: (name, args) => {
            this.println();
            this.print(`  ${colors.blue}⚡ ${name}${colors.reset} ${colors.dim}${this.formatToolArgs(args)}${colors.reset}`);
            this.println();
          },
          onToolResult: (name, result) => {
            // Show truncated result
            const lines = result.split('\n');
            const preview = lines.slice(0, 3).join('\n');
            const more = lines.length > 3 ? ` ${colors.dim}(+${lines.length - 3} lines)${colors.reset}` : '';
            this.println(`  ${colors.gray}${preview}${more}${colors.reset}`);
            this.println();
            this.print(`${colors.cyan}Spot:${colors.reset} `);
          },
          toolContext,
        });

        this.println();
        this.println();

        // Add assistant response to session
        this.session.addMessage('assistant', response);

        // Check if we need to compress history
        const compressed = await this.session.maybeCompress();
        if (compressed) {
          this.println(`${colors.dim}  (context compressed)${colors.reset}`);
        }
      } catch (error) {
        this.println();
        this.println(`${colors.red}Error: ${error}${colors.reset}`);
        this.println();
      }
    }

    this.rl.close();
  }
}
