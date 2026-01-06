// Session management types

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
}

export interface Task {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  created: number;
}

export interface Session {
  id: string;
  projectRoot: string;
  model: string;
  messages: Message[];
  summary: string | null;       // Compressed history when messages get long
  summaryUpTo: number;          // Timestamp of last summarized message
  todos: Task[];
  created: number;
  updated: number;
}

export interface SessionMetadata {
  id: string;
  projectRoot: string;
  model: string;
  messageCount: number;
  created: number;
  updated: number;
}
