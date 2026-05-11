import type { LLMProvider, CompletionRequest, CompletionResponse, StreamChunk, ModelConfig } from './types.js';

export class OpenAIProvider implements LLMProvider {
  readonly id: string;
  readonly type = 'openai' as const;
  readonly config: ModelConfig;

  constructor(config: ModelConfig) {
    this.id = config.id;
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const baseUrl = this.getBaseUrl();
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const baseUrl = this.getBaseUrl();
    const body = this.buildRequestBody(request, false);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${error}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      toolCalls: choice?.message?.tool_calls,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
      model: data.model ?? this.config.model ?? 'unknown',
      latency: Date.now() - start,
    };
  }

  async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const baseUrl = this.getBaseUrl();
    const body = this.buildRequestBody(request, true);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}`);
    }

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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          yield { done: true };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            yield { content: delta.content, done: false };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              yield { toolCall: tc, done: false };
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    yield { done: true };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private getBaseUrl(): string {
    return this.config.baseUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';
  }

  private buildRequestBody(request: CompletionRequest, stream: boolean) {
    const body: Record<string, unknown> = {
      model: this.config.model ?? 'gpt-4o-mini',
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      stream,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    if (request.topP) body.top_p = request.topP;
    if (request.stopSequences) body.stop = request.stopSequences;

    return body;
  }
}
