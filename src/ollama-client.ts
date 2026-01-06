import { Ollama } from 'ollama';
import type { Message } from 'ollama';
import { config } from './config.ts';
import { allTools, getToolByName, type ToolContext } from './tools/index.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatOptions {
  onToken?: (token: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  toolContext?: ToolContext;
}

interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export class OllamaClient {
  private client: Ollama;
  private model: string;

  constructor(model?: string) {
    this.client = new Ollama({ host: config.ollamaHost });
    this.model = model ?? config.primaryModel;
  }

  // Parse tool calls from model output text
  // Supports formats like: {"name": "bash", "arguments": {...}}
  // Or: <tool>bash</tool><args>{"command": "ls"}</args>
  private parseToolCalls(text: string): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];

    // Try JSON format: {"name": "...", "arguments": {...}}
    // More flexible regex to handle nested objects and various whitespace
    const jsonPattern = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})\s*\}/g;
    let match;
    while ((match = jsonPattern.exec(text)) !== null) {
      try {
        const name = match[1]!;
        const args = JSON.parse(match[2]!);
        if (getToolByName(name)) {
          calls.push({ name, arguments: args });
        }
      } catch {}
    }

    // Try simple function call format: tool_name(args)
    if (calls.length === 0) {
      const funcPattern = /\b(bash|read_file|write_file|glob|grep|todo)\s*\(\s*(\{[^)]+\})\s*\)/g;
      while ((match = funcPattern.exec(text)) !== null) {
        try {
          const name = match[1]!;
          const args = JSON.parse(match[2]!);
          calls.push({ name, arguments: args });
        } catch {}
      }
    }

    return calls;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const { onToken, onToolCall, onToolResult, toolContext } = options;

    // Build tool description for the prompt
    const toolDesc = allTools.map(t => {
      const params = Object.entries(t.parameters.properties)
        .map(([k, v]) => `  - ${k}: ${v.description}${v.enum ? ` (options: ${v.enum.join(', ')})` : ''}`)
        .join('\n');
      return `${t.name}: ${t.description}\nParameters:\n${params}`;
    }).join('\n\n');

    // Inject tool instructions into the first system message if not already there
    const messagesWithTools = messages.map((m, i) => {
      if (i === 0 && m.role === 'system' && !m.content.includes('TOOL CALLING')) {
        return {
          ...m,
          content: m.content + `\n\n## TOOL CALLING

When you need to use a tool, output ONLY a JSON object in this exact format (no markdown, no explanation before it):
{"name": "tool_name", "arguments": {"param": "value"}}

Available tools:
${toolDesc}

After I execute the tool, I will give you the result and you can continue.`
        };
      }
      return m;
    });

    const response = await this.client.chat({
      model: this.model,
      messages: messagesWithTools as Message[],
      stream: true,
      options: {
        temperature: config.temperature,
        top_p: config.topP,
        num_ctx: config.contextLength,
      },
    });

    let fullResponse = '';

    for await (const chunk of response) {
      if (chunk.message.content) {
        const token = chunk.message.content;
        fullResponse += token;
        if (onToken) {
          onToken(token);
        }
      }
    }

    // Check if the response contains tool calls
    const toolCalls = this.parseToolCalls(fullResponse);

    if (toolCalls.length > 0) {
      // Add assistant message to history
      messages.push({ role: 'assistant', content: fullResponse });

      // Execute each tool call
      for (const tc of toolCalls) {
        if (onToolCall) {
          onToolCall(tc.name, tc.arguments);
        }

        const tool = getToolByName(tc.name);
        let result: string;

        if (tool) {
          try {
            // Pass context to tool execute
            result = await tool.execute(tc.arguments, toolContext);
          } catch (error) {
            result = `Error executing ${tc.name}: ${error}`;
          }
        } else {
          result = `Unknown tool: ${tc.name}`;
        }

        if (onToolResult) {
          onToolResult(tc.name, result);
        }

        // Add tool result to messages
        messages.push({
          role: 'user',
          content: `Tool result for ${tc.name}:\n${result}`,
        });
      }

      // Get continuation from the model
      return this.chat(messages, options);
    }

    return fullResponse;
  }

  async listModels(): Promise<string[]> {
    const response = await this.client.list();
    return response.models.map(m => m.name);
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }
}
