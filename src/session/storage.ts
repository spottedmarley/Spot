// Session persistence layer

import { createHash } from 'crypto';
import type { Session, SessionMetadata } from './types.ts';

export class SessionStorage {
  private sessionsDir: string;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
  }

  // Hash project root to create a safe directory name
  private hashPath(projectRoot: string): string {
    const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
    const safeName = projectRoot.split('/').pop() || 'default';
    return `${safeName}-${hash}`;
  }

  private getSessionDir(projectRoot: string): string {
    return `${this.sessionsDir}/${this.hashPath(projectRoot)}`;
  }

  private getCurrentPath(projectRoot: string): string {
    return `${this.getSessionDir(projectRoot)}/current.json`;
  }

  private getArchiveDir(projectRoot: string): string {
    return `${this.getSessionDir(projectRoot)}/archive`;
  }

  async save(session: Session): Promise<void> {
    const dir = this.getSessionDir(session.projectRoot);
    const path = this.getCurrentPath(session.projectRoot);

    // Ensure directory exists
    await Bun.$`mkdir -p ${dir}`.quiet();

    await Bun.write(path, JSON.stringify(session, null, 2));
  }

  async load(projectRoot: string): Promise<Session | null> {
    const path = this.getCurrentPath(projectRoot);
    const file = Bun.file(path);

    if (await file.exists()) {
      try {
        const text = await file.text();
        return JSON.parse(text) as Session;
      } catch {
        return null;
      }
    }
    return null;
  }

  async archive(session: Session): Promise<string> {
    const archiveDir = this.getArchiveDir(session.projectRoot);
    await Bun.$`mkdir -p ${archiveDir}`.quiet();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = `${archiveDir}/${timestamp}.json`;

    await Bun.write(archivePath, JSON.stringify(session, null, 2));

    // Clear current session
    const currentPath = this.getCurrentPath(session.projectRoot);
    const currentFile = Bun.file(currentPath);
    if (await currentFile.exists()) {
      await Bun.$`rm ${currentPath}`.quiet();
    }

    return archivePath;
  }

  async listArchived(projectRoot: string): Promise<SessionMetadata[]> {
    const archiveDir = this.getArchiveDir(projectRoot);
    const dir = Bun.file(archiveDir);

    if (!(await Bun.file(archiveDir).exists())) {
      return [];
    }

    const entries: SessionMetadata[] = [];

    try {
      const result = await Bun.$`ls -1 ${archiveDir}/*.json 2>/dev/null`.quiet();
      const files = result.text().trim().split('\n').filter(Boolean);

      for (const file of files) {
        try {
          const content = await Bun.file(file).text();
          const session = JSON.parse(content) as Session;
          entries.push({
            id: session.id,
            projectRoot: session.projectRoot,
            model: session.model,
            messageCount: session.messages.length,
            created: session.created,
            updated: session.updated,
          });
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // No archived sessions
    }

    return entries.sort((a, b) => b.updated - a.updated);
  }

  async loadArchived(projectRoot: string, sessionId: string): Promise<Session | null> {
    const archiveDir = this.getArchiveDir(projectRoot);

    try {
      const result = await Bun.$`ls -1 ${archiveDir}/*.json 2>/dev/null`.quiet();
      const files = result.text().trim().split('\n').filter(Boolean);

      for (const file of files) {
        try {
          const content = await Bun.file(file).text();
          const session = JSON.parse(content) as Session;
          if (session.id === sessionId) {
            return session;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // No archived sessions
    }

    return null;
  }

  async delete(projectRoot: string): Promise<void> {
    const currentPath = this.getCurrentPath(projectRoot);
    const file = Bun.file(currentPath);

    if (await file.exists()) {
      await Bun.$`rm ${currentPath}`.quiet();
    }
  }
}
