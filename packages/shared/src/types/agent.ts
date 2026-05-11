export type LLMProviderType = 'local' | 'openai' | 'claude' | 'custom';

export interface ModelInfo {
  id: string;
  name: string;
  type: LLMProviderType;
  maxTokens: number;
  memoryEstimate: number;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  model: string;
  latency: number;
}

export interface LLMChunk {
  content?: string;
  done: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  duration: number;
  success: boolean;
  error?: string;
}

export interface Citation {
  id: number;
  noteId: string;
  heading?: string;
  range: { startLine: number; endLine: number };
  snippet: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  citations?: Citation[];
  isStreaming?: boolean;
  createdAt: number;
}
