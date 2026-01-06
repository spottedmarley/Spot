// Project detection and context loading

import { basename, dirname, join } from 'path';
import type { ProjectContext, TechStackInfo } from './types.ts';
import { PROJECT_MARKERS } from './types.ts';

export type { ProjectContext, TechStackInfo } from './types.ts';

// Detect project root by walking up from cwd
async function findProjectRoot(cwd: string): Promise<string | null> {
  let dir = cwd;
  const root = '/';

  while (dir !== root) {
    for (const marker of PROJECT_MARKERS) {
      const path = join(dir, marker);
      if (await Bun.file(path).exists()) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

// Load SPOT.md instructions
async function loadSpotMd(projectRoot: string): Promise<string | null> {
  const path = join(projectRoot, 'SPOT.md');
  const file = Bun.file(path);

  if (await file.exists()) {
    try {
      return await file.text();
    } catch {
      return null;
    }
  }
  return null;
}

// Check if directory is a git repo and get branch
async function getGitInfo(projectRoot: string): Promise<{ isRepo: boolean; branch: string | null }> {
  const gitDir = join(projectRoot, '.git');

  if (!(await Bun.file(gitDir).exists())) {
    return { isRepo: false, branch: null };
  }

  try {
    const result = await Bun.$`git -C ${projectRoot} branch --show-current 2>/dev/null`.quiet();
    const branch = result.text().trim() || null;
    return { isRepo: true, branch };
  } catch {
    return { isRepo: true, branch: null };
  }
}

// Detect tech stack from manifest files
async function detectTechStack(projectRoot: string): Promise<TechStackInfo[]> {
  const stack: TechStackInfo[] = [];

  // Check package.json (Node/Bun)
  const packageJsonPath = join(projectRoot, 'package.json');
  if (await Bun.file(packageJsonPath).exists()) {
    try {
      const pkg = await Bun.file(packageJsonPath).json();

      // Runtime
      if (pkg.devDependencies?.['bun-types'] || pkg.dependencies?.['bun']) {
        stack.push({ type: 'runtime', name: 'Bun' });
      } else {
        stack.push({ type: 'runtime', name: 'Node.js' });
      }

      // Language
      if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
        stack.push({ type: 'language', name: 'TypeScript' });
      } else {
        stack.push({ type: 'language', name: 'JavaScript' });
      }

      // Frameworks
      if (pkg.dependencies?.react) {
        stack.push({ type: 'framework', name: 'React', version: pkg.dependencies.react });
      }
      if (pkg.dependencies?.vue) {
        stack.push({ type: 'framework', name: 'Vue', version: pkg.dependencies.vue });
      }
      if (pkg.dependencies?.svelte) {
        stack.push({ type: 'framework', name: 'Svelte', version: pkg.dependencies.svelte });
      }
      if (pkg.dependencies?.express) {
        stack.push({ type: 'framework', name: 'Express', version: pkg.dependencies.express });
      }
      if (pkg.dependencies?.next) {
        stack.push({ type: 'framework', name: 'Next.js', version: pkg.dependencies.next });
      }
    } catch {
      stack.push({ type: 'runtime', name: 'Node.js' });
    }
  }

  // Check Cargo.toml (Rust)
  if (await Bun.file(join(projectRoot, 'Cargo.toml')).exists()) {
    stack.push({ type: 'language', name: 'Rust' });
  }

  // Check go.mod (Go)
  if (await Bun.file(join(projectRoot, 'go.mod')).exists()) {
    stack.push({ type: 'language', name: 'Go' });
  }

  // Check pyproject.toml or requirements.txt (Python)
  if (
    await Bun.file(join(projectRoot, 'pyproject.toml')).exists() ||
    await Bun.file(join(projectRoot, 'requirements.txt')).exists() ||
    await Bun.file(join(projectRoot, 'setup.py')).exists()
  ) {
    stack.push({ type: 'language', name: 'Python' });
  }

  return stack;
}

// Extract project name from SPOT.md frontmatter or directory name
function extractProjectName(instructions: string | null, projectRoot: string): string {
  if (instructions) {
    // Try to extract from frontmatter: # Project Name or name: in YAML front matter
    const titleMatch = instructions.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Try YAML frontmatter
    const yamlMatch = instructions.match(/^---\n[\s\S]*?name:\s*(.+)\n[\s\S]*?---/);
    if (yamlMatch) {
      return yamlMatch[1].trim();
    }
  }

  // Fall back to directory name
  return basename(projectRoot);
}

// Main detection function
export async function detectProject(cwd: string): Promise<ProjectContext> {
  const projectRoot = await findProjectRoot(cwd) || cwd;
  const instructions = await loadSpotMd(projectRoot);
  const gitInfo = await getGitInfo(projectRoot);
  const techStack = await detectTechStack(projectRoot);
  const name = extractProjectName(instructions, projectRoot);

  return {
    root: projectRoot,
    name,
    instructions,
    gitRepo: gitInfo.isRepo,
    gitBranch: gitInfo.branch,
    techStack,
    cwd,
  };
}

// Format project context for injection into system prompt
export function formatProjectContext(project: ProjectContext): string {
  const parts: string[] = [];

  // Project instructions (highest priority)
  if (project.instructions) {
    parts.push(`## Project Instructions (from SPOT.md)\n\n${project.instructions}`);
  }

  // Environment info
  const envLines: string[] = [
    `Working directory: ${project.cwd}`,
    `Project root: ${project.root}`,
    `Project name: ${project.name}`,
  ];

  if (project.gitRepo) {
    envLines.push(`Git repo: yes${project.gitBranch ? ` (branch: ${project.gitBranch})` : ''}`);
  }

  if (project.techStack.length > 0) {
    const stackStr = project.techStack
      .map(s => s.version ? `${s.name} ${s.version}` : s.name)
      .join(', ');
    envLines.push(`Tech stack: ${stackStr}`);
  }

  parts.push(`## Environment\n${envLines.join('\n')}`);

  return parts.join('\n\n');
}

// Check if a SPOT.md file exists in the project
export async function hasSpotMd(projectRoot: string): Promise<boolean> {
  return Bun.file(join(projectRoot, 'SPOT.md')).exists();
}
