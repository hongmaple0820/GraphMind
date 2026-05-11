import type { EmbeddingFunction } from './service.js';

export interface EmbeddingProviderConfig {
  type: 'openai' | 'local' | 'custom';
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

const DEFAULT_DIMENSIONS = 384;
const OPENAI_DIMENSIONS = 1536;

class EmbeddingService {
  private config: EmbeddingProviderConfig;
  private cache = new Map<string, number[]>();

  constructor(config: EmbeddingProviderConfig) {
    this.config = config;
  }

  updateConfig(config: EmbeddingProviderConfig) {
    this.config = config;
    this.cache.clear();
  }

  getEmbedFunction(): EmbeddingFunction {
    return async (texts: string[]): Promise<number[][]> => {
      const results: number[][] = [];

      const uncached: { index: number; text: string }[] = [];
      for (let i = 0; i < texts.length; i++) {
        const key = this.cacheKey(texts[i]);
        const cached = this.cache.get(key);
        if (cached) {
          results[i] = cached;
        } else {
          uncached.push({ index: i, text: texts[i] });
        }
      }

      if (uncached.length > 0) {
        const embeddings = await this.fetchEmbeddings(uncached.map((u) => u.text));
        for (let j = 0; j < uncached.length; j++) {
          const idx = uncached[j].index;
          results[idx] = embeddings[j];
          this.cache.set(this.cacheKey(uncached[j].text), embeddings[j]);
        }

        if (this.cache.size > 10000) {
          const keys = Array.from(this.cache.keys());
          for (let k = 0; k < keys.length - 5000; k++) {
            this.cache.delete(keys[k]);
          }
        }
      }

      return results;
    };
  }

  private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
    switch (this.config.type) {
      case 'openai':
        return this.fetchOpenAI(texts);
      case 'local':
        return this.fetchLocal(texts);
      case 'custom':
        return this.fetchCustom(texts);
      default:
        return this.fallbackEmbeddings(texts);
    }
  }

  private async fetchOpenAI(texts: string[]): Promise<number[][]> {
    const url = this.config.apiUrl ?? 'https://api.openai.com/v1/embeddings';
    const model = this.config.model ?? 'text-embedding-3-small';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey ?? ''}`,
        },
        body: JSON.stringify({
          input: texts,
          model,
          dimensions: this.config.dimensions ?? OPENAI_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data.map((d) => d.embedding);
    } catch (err) {
      console.warn('OpenAI embedding failed, falling back:', err);
      return this.fallbackEmbeddings(texts);
    }
  }

  private async fetchLocal(texts: string[]): Promise<number[][]> {
    const url = this.config.apiUrl ?? 'http://localhost:8080/embedding';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: texts.length === 1 ? texts[0] : texts,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Local embedding error: ${response.status}`);
      }

      const data = await response.json() as {
        embedding?: number[];
        embeddings?: number[][];
      };

      if (data.embeddings) {
        return data.embeddings;
      } else if (data.embedding) {
        return [data.embedding];
      }

      throw new Error('Invalid local embedding response');
    } catch (err) {
      console.warn('Local embedding failed, falling back:', err);
      return this.fallbackEmbeddings(texts);
    }
  }

  private async fetchCustom(texts: string[]): Promise<number[][]> {
    if (!this.config.apiUrl) {
      return this.fallbackEmbeddings(texts);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: texts,
          model: this.config.model ?? 'default',
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Custom embedding error: ${response.status}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data.map((d) => d.embedding);
    } catch (err) {
      console.warn('Custom embedding failed, falling back:', err);
      return this.fallbackEmbeddings(texts);
    }
  }

  private fallbackEmbeddings(texts: string[]): number[][] {
    const dim = this.config.dimensions ?? DEFAULT_DIMENSIONS;
    return texts.map((text) => {
      const seed = this.hashString(text);
      const embedding = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        const x = Math.sin(seed * (i + 1) * 0.0001) * 10000;
        embedding[i] = x - Math.floor(x) - 0.5;
      }
      const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
      return embedding.map((v) => v / norm);
    });
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private cacheKey(text: string): string {
    const len = text.length;
    return `${len}:${text.slice(0, 64)}:${text.slice(-64)}`;
  }
}

let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(config?: EmbeddingProviderConfig): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(config ?? { type: 'local' });
  } else if (config) {
    embeddingService.updateConfig(config);
  }
  return embeddingService;
}
