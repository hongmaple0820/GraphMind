import type { LLMProvider, CompletionRequest, CompletionResponse, StreamChunk, ModelConfig } from './types.js';

export class LocalProvider implements LLMProvider {
  readonly id: string;
  readonly type = 'local' as const;
  readonly config: ModelConfig;
  private serverUrl: string;
  private loadedModel: string | null = null;

  constructor(config: ModelConfig) {
    this.id = config.id;
    this.config = config;
    this.serverUrl = config.baseUrl?.replace(/\/$/, '') ?? 'http://127.0.0.1:8080';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.serverUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async loadModel(modelPath: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/loadModel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelPath }),
    });
    if (!res.ok) throw new Error(`Failed to load model: ${res.statusText}`);
    this.loadedModel = modelPath;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const prompt = this.buildPrompt(request);

    const body: Record<string, unknown> = {
      prompt,
      n_predict: request.maxTokens ?? this.config.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      top_p: request.topP ?? 0.9,
      stop: request.stopSequences ?? ['</s>', '[INST]'],
      stream: false,
    };

    const res = await fetch(`${this.serverUrl}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Local LLM error ${res.status}`);

    const data = await res.json();
    return {
      content: data.content ?? '',
      usage: {
        promptTokens: data.tokens_evaluated ?? 0,
        completionTokens: data.tokens_predicted ?? 0,
      },
      model: this.config.model ?? 'local',
      latency: Date.now() - start,
    };
  }

  async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const prompt = this.buildPrompt(request);

    const body: Record<string, unknown> = {
      prompt,
      n_predict: request.maxTokens ?? this.config.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      top_p: request.topP ?? 0.9,
      stop: request.stopSequences ?? ['</s>', '[INST]'],
      stream: true,
    };

    const res = await fetch(`${this.serverUrl}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Local LLM error ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            yield { content: parsed.content, done: false };
          }
          if (parsed.stop) {
            yield { done: true };
            return;
          }
        } catch {
          // skip
        }
      }
    }

    yield { done: true };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }

  private buildPrompt(request: CompletionRequest): string {
    let prompt = '';

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        prompt += `<|system|>\n${msg.content}</s>\n`;
      } else if (msg.role === 'user') {
        prompt += `<|user|>\n${msg.content}</s>\n`;
      } else if (msg.role === 'assistant') {
        prompt += `<|assistant|)\n${msg.content}</s>\n`;
      }
    }

    prompt += '<|assistant|)\n';
    return prompt;
  }
}
