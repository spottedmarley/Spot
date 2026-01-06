// Session manager - handles conversation persistence and context management

import { randomUUID } from 'crypto';
import type { Session, Message, Task, SessionMetadata } from './types.ts';
import { SessionStorage } from './storage.ts';
import { Summarizer, estimateMessagesTokens } from './summarizer.ts';
import { config } from '../config.ts';

// Re-export types for convenience
export type { Session, Message, Task, SessionMetadata } from './types.ts';

// When to trigger summarization (in estimated tokens)
const CONTEXT_THRESHOLD = 24000;
// How many recent messages to keep after summarization
const KEEP_RECENT_MESSAGES = 10;
// Auto-save debounce (ms)
const AUTOSAVE_DELAY = 2000;

export class SessionManager {
  private session: Session;
  private storage: SessionStorage;
  private summarizer: Summarizer;
  private saveTimeout: Timer | null = null;
  private dirty: boolean = false;

  constructor(projectRoot: string, sessionsDir: string) {
    this.storage = new SessionStorage(sessionsDir);
    this.summarizer = new Summarizer();

    // Initialize with empty session - call load() to restore
    this.session = this.createEmptySession(projectRoot);
  }

  private createEmptySession(projectRoot: string, model?: string): Session {
    return {
      id: randomUUID(),
      projectRoot,
      model: model ?? config.primaryModel,
      messages: [],
      summary: null,
      summaryUpTo: 0,
      todos: [],
      created: Date.now(),
      updated: Date.now(),
    };
  }

  // Load existing session or create new
  async load(): Promise<boolean> {
    const existing = await this.storage.load(this.session.projectRoot);
    if (existing) {
      this.session = existing;
      return true;
    }
    return false;
  }

  // Get session ID
  getId(): string {
    return this.session.id;
  }

  // Get current model
  getModel(): string {
    return this.session.model;
  }

  // Set model
  setModel(model: string): void {
    this.session.model = model;
    this.markDirty();
  }

  // Add a message to the session
  addMessage(role: Message['role'], content: string): void {
    this.session.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });
    this.session.updated = Date.now();
    this.markDirty();
  }

  // Get all messages (excluding system, for display)
  getMessages(): Message[] {
    return this.session.messages;
  }

  // Get messages formatted for the model, including summary if available
  getContextMessages(systemPrompt: string): Message[] {
    const messages: Message[] = [];

    // Add system prompt with summary if available
    let fullSystemPrompt = systemPrompt;
    if (this.session.summary) {
      fullSystemPrompt += `\n\n## Previous Conversation Summary\n${this.session.summary}`;
    }

    messages.push({
      role: 'system',
      content: fullSystemPrompt,
      timestamp: 0,
    });

    // Add recent messages (after summary point, or all if no summary)
    const recentMessages = this.session.summary
      ? this.session.messages.filter(m => m.timestamp > this.session.summaryUpTo)
      : this.session.messages;

    messages.push(...recentMessages);

    return messages;
  }

  // Check and compress history if needed
  async maybeCompress(): Promise<boolean> {
    const messages = this.session.messages;
    const tokenEstimate = estimateMessagesTokens(messages);

    if (tokenEstimate < CONTEXT_THRESHOLD) {
      return false;
    }

    // Find split point - keep recent messages
    const splitIndex = Math.max(0, messages.length - KEEP_RECENT_MESSAGES);
    const toSummarize = messages.slice(0, splitIndex);

    if (toSummarize.length === 0) {
      return false;
    }

    // Summarize older messages
    const newSummary = await this.summarizer.summarize(toSummarize);

    // Combine with existing summary if present
    if (this.session.summary) {
      this.session.summary = `${this.session.summary}\n\n---\n\n${newSummary}`;
    } else {
      this.session.summary = newSummary;
    }

    // Update summary timestamp
    const lastSummarized = toSummarize[toSummarize.length - 1];
    if (lastSummarized) {
      this.session.summaryUpTo = lastSummarized.timestamp;
    }

    // Keep only recent messages
    this.session.messages = messages.slice(splitIndex);
    this.markDirty();

    return true;
  }

  // Force save immediately
  async save(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.storage.save(this.session);
    this.dirty = false;
  }

  // Mark dirty and schedule auto-save
  private markDirty(): void {
    this.dirty = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      if (this.dirty) {
        await this.storage.save(this.session);
        this.dirty = false;
      }
    }, AUTOSAVE_DELAY);
  }

  // Archive current session and start fresh
  async archive(): Promise<string> {
    // Save first
    await this.save();

    // Archive
    const archivePath = await this.storage.archive(this.session);

    // Create new session
    this.session = this.createEmptySession(this.session.projectRoot, this.session.model);

    return archivePath;
  }

  // Clear current session (in-memory only, doesn't delete from disk)
  clear(): void {
    const projectRoot = this.session.projectRoot;
    const model = this.session.model;
    this.session = this.createEmptySession(projectRoot, model);
    this.markDirty();
  }

  // List archived sessions
  async listArchived(): Promise<SessionMetadata[]> {
    return this.storage.listArchived(this.session.projectRoot);
  }

  // Load an archived session
  async loadArchived(sessionId: string): Promise<boolean> {
    const archived = await this.storage.loadArchived(this.session.projectRoot, sessionId);
    if (archived) {
      this.session = archived;
      this.markDirty();
      return true;
    }
    return false;
  }

  // Get session info for display
  getInfo(): {
    id: string;
    messageCount: number;
    hasSummary: boolean;
    created: Date;
    updated: Date;
  } {
    return {
      id: this.session.id.slice(0, 8),
      messageCount: this.session.messages.length,
      hasSummary: !!this.session.summary,
      created: new Date(this.session.created),
      updated: new Date(this.session.updated),
    };
  }

  // --- Todo Management ---

  getTodos(): Task[] {
    return this.session.todos;
  }

  addTodo(content: string): Task {
    const task: Task = {
      id: randomUUID().slice(0, 8),
      content,
      status: 'pending',
      created: Date.now(),
    };
    this.session.todos.push(task);
    this.markDirty();
    return task;
  }

  updateTodo(id: string, status: Task['status']): boolean {
    const task = this.session.todos.find(t => t.id === id);
    if (task) {
      task.status = status;
      this.markDirty();
      return true;
    }
    return false;
  }

  removeTodo(id: string): boolean {
    const index = this.session.todos.findIndex(t => t.id === id);
    if (index >= 0) {
      this.session.todos.splice(index, 1);
      this.markDirty();
      return true;
    }
    return false;
  }

  clearCompletedTodos(): number {
    const before = this.session.todos.length;
    this.session.todos = this.session.todos.filter(t => t.status !== 'completed');
    const removed = before - this.session.todos.length;
    if (removed > 0) {
      this.markDirty();
    }
    return removed;
  }

  // Format todos for injection into system prompt
  formatTodosForPrompt(): string {
    const todos = this.session.todos;
    if (todos.length === 0) {
      return '';
    }

    const lines = todos.map(t => {
      const icon = t.status === 'completed' ? '[x]' :
                   t.status === 'in_progress' ? '[>]' : '[ ]';
      return `${icon} ${t.content} (id: ${t.id})`;
    });

    return `\n## Current Tasks\n${lines.join('\n')}`;
  }
}
