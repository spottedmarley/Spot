// Project context types

export interface ProjectContext {
  // Root directory of the project (where SPOT.md or markers found)
  root: string;

  // Project name (from SPOT.md frontmatter or directory name)
  name: string;

  // Instructions from SPOT.md
  instructions: string | null;

  // Is this a git repository?
  gitRepo: boolean;

  // Git branch (if git repo)
  gitBranch: string | null;

  // Detected tech stack from manifest files
  techStack: TechStackInfo[];

  // Working directory (may differ from root)
  cwd: string;
}

export interface TechStackInfo {
  type: 'runtime' | 'language' | 'framework' | 'tool';
  name: string;
  version?: string;
}

// Project markers - files that indicate a project root
export const PROJECT_MARKERS = [
  'SPOT.md',           // Spot-specific instructions (highest priority)
  '.git',              // Git repository
  'package.json',      // Node/Bun project
  'Cargo.toml',        // Rust project
  'go.mod',            // Go project
  'pyproject.toml',    // Python project
  'setup.py',          // Python project (legacy)
  'requirements.txt',  // Python project (simple)
  'Makefile',          // Generic project
  'CMakeLists.txt',    // C/C++ project
  'pom.xml',           // Java/Maven project
  'build.gradle',      // Java/Gradle project
  'Gemfile',           // Ruby project
  'composer.json',     // PHP project
  'mix.exs',           // Elixir project
  'deno.json',         // Deno project
];
