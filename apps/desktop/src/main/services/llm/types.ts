export type LLMProviderType = 'local' | 'openai' | 'claude' | 'custom';

export interface ModelConfig {
  id: string;
  name: string;
  type: LLMProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  enabled: boolean;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  stream?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface CompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  model: string;
  latency: number;
}

export interface StreamChunk {
  content?: string;
  toolCall?: Partial<ToolCall>;
  done: boolean;
}

export interface LLMProvider {
  readonly id: string;
  readonly type: LLMProviderType;
  readonly config: ModelConfig;

  isAvailable(): Promise<boolean>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  completeStream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  estimateTokens(text: string): number;
}

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'openai-gpt-4o-mini',
    name: 'GPT-4o Mini',
    type: 'openai',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    enabled: false,
  },
  {
    id: 'openai-gpt-4o',
    name: 'GPT-4o',
    type: 'openai',
    model: 'gpt-4o',
    maxTokens: 4096,
    enabled: false,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude 3.5 Sonnet',
    type: 'claude',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    enabled: false,
  },
  {
    id: 'claude-haiku',
    name: 'Claude 3.5 Haiku',
    type: 'claude',
    model: 'claude-3-5-haiku-20241022',
    maxTokens: 4096,
    enabled: false,
  },
  {
    id: 'local-qwen7b',
    name: 'Qwen2.5-7B (Local)',
    type: 'local',
    model: 'qwen2.5-7b-q4_k_m.gguf',
    maxTokens: 2048,
    enabled: false,
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    type: 'custom',
    maxTokens: 4096,
    enabled: false,
  },
];
