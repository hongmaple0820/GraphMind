import type { LLMProvider, ModelConfig, LLMProviderType } from './types.js';
import { OpenAIProvider } from './openai-provider.js';

export class CustomProvider extends OpenAIProvider implements LLMProvider {
  override readonly type: LLMProviderType = 'custom';

  constructor(config: ModelConfig) {
    super(config);
    if (!config.baseUrl) {
      throw new Error('Custom provider requires a baseUrl');
    }
  }
}
