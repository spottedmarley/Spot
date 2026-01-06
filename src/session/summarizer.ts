// Context summarizer - compresses conversation history using a fast model

import { Ollama } from 'ollama';
import { config } from '../config.ts';
import type { Message } from './types.ts';

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Summarize the following conversation between a user and an AI assistant (Spot).

Focus on:
- Key decisions made
- Important facts established
- Tasks completed or in progress
- Any code changes or file modifications
- Context the assistant needs to continue helping

Be concise but preserve critical details. Output only the summary, no preamble.

Conversation:
`;

export class Summarizer {
  private client: Ollama;
  private model: string;

  constructor(model?: string) {
    this.client = new Ollama({ host: config.ollamaHost });
    // Use fast model for summarization by default
    this.model = model ?? config.fastModel;
  }

  async summarize(messages: Message[]): Promise<string> {
    // Format messages for summarization
    const formatted = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const role = m.role === 'user' ? 'User' :
                     m.role === 'assistant' ? 'Spot' : 'Tool';
        // Truncate very long messages
        const content = m.content.length > 2000
          ? m.content.slice(0, 2000) + '...[truncated]'
          : m.content;
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const prompt = SUMMARIZE_PROMPT + formatted;

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.3,  // Lower temperature for factual summarization
          num_ctx: config.contextLength,
        },
      });

      return response.message.content;
    } catch (error) {
      // If summarization fails, return a basic fallback
      console.error('Summarization failed:', error);
      return this.fallbackSummary(messages);
    }
  }

  private fallbackSummary(messages: Message[]): string {
    // Simple fallback: just count messages and note rough content
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;

    // Try to extract any file paths mentioned
    const allContent = messages.map(m => m.content).join(' ');
    const filePaths = allContent.match(/[\/\w.-]+\.\w+/g) || [];
    const uniquePaths = [...new Set(filePaths)].slice(0, 10);

    let summary = `Previous conversation: ${userMessages} user messages, ${assistantMessages} assistant responses.`;

    if (uniquePaths.length > 0) {
      summary += ` Files discussed: ${uniquePaths.join(', ')}.`;
    }

    return summary;
  }
}

// Estimate token count (rough approximation)
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}
