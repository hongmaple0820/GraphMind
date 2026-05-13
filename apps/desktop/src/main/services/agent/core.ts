import type { LLMRouter } from '../llm/router.js';
import type { ChatMessage, ToolCall, CompletionResponse } from '../llm/types.js';
import type { ToolRegistry, ToolContext, ToolCallResult } from './tools.js';

const SYSTEM_PROMPT = `You are GraphMind Agent, an AI assistant for a local-first knowledge base. You help users explore, search, and manage their notes.

Capabilities:
- Search and navigate the knowledge graph
- Retrieve relevant content from notes
- Summarize notes
- Create new notes
- List notes by tag

Guidelines:
- Always cite your sources when referencing notes (e.g., [[note-title]])
- Be concise but thorough
- When uncertain, say so rather than guessing
- Use tools to find information before answering`;

const MAX_TOOL_ROUNDS = 5;

export class AgentCore {
  private llmRouter: LLMRouter;
  private toolRegistry: ToolRegistry;
  private context: ToolContext;

  constructor(llmRouter: LLMRouter, toolRegistry: ToolRegistry, context: ToolContext) {
    this.llmRouter = llmRouter;
    this.toolRegistry = toolRegistry;
    this.context = context;
  }

  async chat(userMessage: string, history: ChatMessage[] = []): Promise<CompletionResponse> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMessage },
    ];

    return this.runReActLoop(messages);
  }

  async *chatStream(userMessage: string, history: ChatMessage[] = []): AsyncGenerator<{
    type: 'text' | 'tool_call' | 'tool_result' | 'done';
    content?: string;
    toolCall?: ToolCall;
    toolResult?: ToolCallResult;
    finalResponse?: CompletionResponse;
  }> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMessage },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.llmRouter.complete({
        messages,
        tools: this.toolRegistry.getDefinitions(),
        maxTokens: 2048,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        yield* this.yieldStreamContent(response.content);
        yield { type: 'done', finalResponse: response };
        return;
      }

      yield { type: 'text', content: response.content || '' };

      for (const toolCall of response.toolCalls) {
        yield { type: 'tool_call', toolCall };

        const args = this.parseToolArgs(toolCall);
        const result = await this.toolRegistry.execute(
          toolCall.function.name,
          args,
          this.context,
        );

        yield { type: 'tool_result', toolResult: result };

        messages.push({
          role: 'assistant',
          content: response.content ?? '',
          toolCalls: [toolCall],
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify(result.result ?? result.error),
          toolCallId: toolCall.id,
        });
      }
    }

    const finalResponse = await this.llmRouter.complete({ messages, maxTokens: 1024 });
    yield* this.yieldStreamContent(finalResponse.content);
    yield { type: 'done', finalResponse };
  }

  private async runReActLoop(messages: ChatMessage[]): Promise<CompletionResponse> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.llmRouter.complete({
        messages,
        tools: this.toolRegistry.getDefinitions(),
        maxTokens: 2048,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response;
      }

      for (const toolCall of response.toolCalls) {
        const args = this.parseToolArgs(toolCall);
        const result = await this.toolRegistry.execute(
          toolCall.function.name,
          args,
          this.context,
        );

        messages.push({
          role: 'assistant',
          content: response.content ?? '',
          toolCalls: [toolCall],
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify(result.result ?? result.error),
          toolCallId: toolCall.id,
        });
      }
    }

    return this.llmRouter.complete({ messages, maxTokens: 1024 });
  }

  private parseToolArgs(toolCall: ToolCall): Record<string, unknown> {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      return {};
    }
  }

  private async *yieldStreamContent(content: string): AsyncGenerator<{ type: 'text'; content: string }> {
    const words = content.split(/(\s+)/);
    for (const word of words) {
      yield { type: 'text', content: word };
    }
  }
}
