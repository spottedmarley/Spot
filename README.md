# Spot

A local CLI-based AI coding agent similar to Claude Code, powered by [Ollama](https://ollama.ai). Runs entirely offline with no external API dependencies.

## Features

- **Interactive REPL** with streaming responses
- **Tool system** - file ops, bash, search, edit, task tracking
- **Session persistence** - auto-save and resume conversations
- **Project context** - detects project type and loads custom instructions from `SPOT.md`
- **Context compression** - automatic summarization for unlimited conversation length
- **Multi-model support** - switch between models on the fly
- **Portable** - designed to run from a removable SSD

## Requirements

- Linux (tested on Debian-based distros)
- [Ollama](https://ollama.ai) installed
- GPU with sufficient VRAM (32GB+ for 32B models, 8GB+ for 7B models)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/spottedmarley/Spot.git
cd Spot

# Install dependencies
bun install

# Run Spot
./spot
```

The `spot` launcher script will:
1. Check that Ollama is installed
2. Start `ollama serve` if not running
3. Launch the Spot REPL

## Usage

### REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/model` | Switch models (interactive) |
| `/model <name>` | Switch to specific model |
| `/session` | Show session info |
| `/session new` | Archive current session, start fresh |
| `/project` | Show detected project info |
| `/todo` | List tasks |
| `/todo add <task>` | Add a task |
| `/tools` | List available tools |
| `/clear` | Clear conversation |
| `/quit` | Exit (saves session) |

### Tools

Spot can use these tools autonomously:

| Tool | Purpose |
|------|---------|
| `ls` | List directory contents |
| `read_file` | Read file with line numbers |
| `write_file` | Create/overwrite files |
| `edit_file` | Surgical string replacement |
| `bash` | Execute shell commands |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `todo` | Manage task list |

### Project Instructions

Create a `SPOT.md` file in your project root to give Spot custom instructions:

```markdown
# My Project

Guidelines:
- Use TypeScript
- Follow existing code style
- Run tests before committing
```

## Models

Recommended models for coding tasks:

| Model | Size | Best For |
|-------|------|----------|
| `qwen2.5-coder:32b-instruct` | 19GB | Complex coding, multi-file refactoring |
| `llama3:8b-instruct` | 4.9GB | Quick tasks, simple questions |
| `codellama:7b` | 3.8GB | Basic code generation |

## Architecture

```
src/
├── repl.ts           # Interactive command loop
├── ollama-client.ts  # LLM integration with tool parsing
├── session/          # Session persistence & compression
├── project/          # Project detection & SPOT.md loading
└── tools/            # Tool implementations
```

## License

MIT
