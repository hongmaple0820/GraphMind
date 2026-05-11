import type { LLMProvider, ModelConfig, CompletionRequest, CompletionResponse, StreamChunk } from './types.js';
import { OpenAIProvider } from './openai-provider.js';

export class CustomProvider extends OpenAIProvider implements LLMProvider {
  readonly type = 'custom' as const;

  constructor(config: ModelConfig) {
    super(config);
    if (!config.baseUrl) {
      throw new Error('Custom provider requires a baseUrl');
    }
  }
}
