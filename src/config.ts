// Spot Configuration

export const config = {
  // Primary model for coding and complex tasks
  primaryModel: "qwen2.5-coder:32b-instruct",

  // Fast model for simple tasks (optional, can use primary for everything)
  fastModel: "llama3:8b-instruct-q4_K_M",

  // Ollama server
  ollamaHost: "http://localhost:11434",

  // Context settings
  contextLength: 32768,  // Max context window to use

  // Generation settings
  temperature: 0.7,
  topP: 0.9,

  // Application paths
  historyDir: "./history",
  sessionsDir: "./sessions",
};

export type Config = typeof config;
