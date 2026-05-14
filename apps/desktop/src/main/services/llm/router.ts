import type { LLMProvider, ModelConfig, CompletionRequest, CompletionResponse, StreamChunk } from './types.js';
import { OpenAIProvider } from './openai-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { LocalProvider } from './local-provider.js';
import { CustomProvider } from './custom-provider.js';
import { DEFAULT_MODELS } from './types.js';

export class LLMRouter {
  private providers = new Map<string, LLMProvider>();
  private configs = new Map<string, ModelConfig>();
  private primaryModelId: string | null = null;
  private fallbackModelId: string | null = null;
  private timeoutMs: number;
  private availabilityCache = new Map<string, { available: boolean; checkedAt: number }>();
  private cacheTtl = 60000;

  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
    for (const config of DEFAULT_MODELS) {
      this.configs.set(config.id, config);
    }
  }

  registerProvider(config: ModelConfig): void {
    this.configs.set(config.id, config);
    const provider = this.createProvider(config);
    if (provider) {
      this.providers.set(config.id, provider);
    }
  }

  setPrimary(modelId: string): void {
    if (!this.configs.has(modelId)) throw new Error(`Unknown model: ${modelId}`);
    this.primaryModelId = modelId;
  }

  setFallback(modelId: string): void {
    if (!this.configs.has(modelId)) throw new Error(`Unknown model: ${modelId}`);
    this.fallbackModelId = modelId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const provider = await this.resolveProvider();
    if (!provider) throw new Error('No LLM provider available. Configure API keys in Settings.');
    return this.withTimeout(provider.complete(request), this.timeoutMs);
  }

  async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const provider = await this.resolveProvider();
    if (!provider) throw new Error('No LLM provider available. Configure API keys in Settings.');
    yield* provider.completeStream(request);
  }

  async checkAvailability(modelId: string): Promise<boolean> {
    const cached = this.availabilityCache.get(modelId);
    if (cached && Date.now() - cached.checkedAt < this.cacheTtl) {
      return cached.available;
    }

    const provider = this.getOrCreateProvider(modelId);
    if (!provider) return false;

    try {
      const available = await provider.isAvailable();
      this.availabilityCache.set(modelId, { available, checkedAt: Date.now() });
      return available;
    } catch {
      this.availabilityCache.set(modelId, { available: false, checkedAt: Date.now() });
      return false;
    }
  }

  getConfig(modelId: string): ModelConfig | undefined {
    return this.configs.get(modelId);
  }

  getAllConfigs(): ModelConfig[] {
    return Array.from(this.configs.values());
  }

  updateConfig(modelId: string, updates: Partial<ModelConfig>): void {
    const existing = this.configs.get(modelId);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    this.configs.set(modelId, updated);
    this.providers.delete(modelId);
    this.availabilityCache.delete(modelId);
  }

  getPrimaryModelId(): string | null {
    return this.primaryModelId;
  }

  getPrimaryProvider(): LLMProvider | null {
    if (this.primaryModelId) {
      return this.getOrCreateProvider(this.primaryModelId);
    }
    return null;
  }

  private async resolveProvider(): Promise<LLMProvider | null> {
    const candidates: string[] = [];
    if (this.primaryModelId) candidates.push(this.primaryModelId);
    if (this.fallbackModelId && this.fallbackModelId !== this.primaryModelId) {
      candidates.push(this.fallbackModelId);
    }
    for (const [id, config] of this.configs) {
      if (config.enabled && !candidates.includes(id)) candidates.push(id);
    }

    for (const modelId of candidates) {
      const available = await this.checkAvailability(modelId);
      if (available) return this.getOrCreateProvider(modelId);
    }

    return null;
  }

  private getOrCreateProvider(modelId: string): LLMProvider | null {
    const existing = this.providers.get(modelId);
    if (existing) return existing;

    const config = this.configs.get(modelId);
    if (!config) return null;

    const provider = this.createProvider(config);
    if (provider) this.providers.set(modelId, provider);
    return provider;
  }

  private createProvider(config: ModelConfig): LLMProvider | null {
    try {
      switch (config.type) {
        case 'openai': return new OpenAIProvider(config);
        case 'claude': return new ClaudeProvider(config);
        case 'local': return new LocalProvider(config);
        case 'custom': return new CustomProvider(config);
        default: return null;
      }
    } catch (err) {
      console.warn(`Failed to create provider "${config.id}" (${config.type}):`, err);
      return null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`LLM request timed out after ${ms}ms`)), ms),
      ),
    ]);
  }
}
