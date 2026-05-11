import type { LLMProvider, CompletionRequest, CompletionResponse, StreamChunk, ModelConfig, ToolCall } from './types.js';

export class ClaudeProvider implements LLMProvider {
  readonly id: string;
  readonly type = 'claude' as const;
  readonly config: ModelConfig;

  constructor(config: ModelConfig) {
    this.id = config.id;
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const body = this.buildRequestBody(request, false);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Claude API error ${res.status}: ${error}`);
    }

    const data = await res.json();
    return this.parseResponse(data, start);
  }

  async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const body = this.buildRequestBody(request, true);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Claude API error ${res.status}`);

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
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            yield { content: parsed.delta.text, done: false };
          }
          if (parsed.type === 'message_stop') {
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
    return Math.ceil(text.length / 3.5);
  }

  private buildRequestBody(request: CompletionRequest, stream: boolean) {
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const nonSystemMsgs = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.config.model ?? 'claude-3-5-sonnet-20241022',
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.role === 'tool' ? `[Tool result ${m.toolCallId}]: ${m.content}` : m.content,
      })),
      stream,
    };

    if (systemMsg) body.system = systemMsg.content;

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    return body;
  }

  private parseResponse(data: Record<string, unknown>, start: number): CompletionResponse {
    const contentBlocks = data.content as Array<{ type: string; text?: string; name?: string; input?: unknown }> ?? [];
    const textContent = contentBlocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');

    const toolCalls: ToolCall[] = contentBlocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({
        id: (b as Record<string, unknown>).id as string ?? 'tc-0',
        type: 'function' as const,
        function: {
          name: b.name ?? '',
          arguments: JSON.stringify(b.input ?? {}),
        },
      }));

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: (data.usage as Record<string, number>)?.input_tokens ?? 0,
        completionTokens: (data.usage as Record<string, number>)?.output_tokens ?? 0,
      },
      model: data.model as string ?? 'unknown',
      latency: Date.now() - start,
    };
  }
}
