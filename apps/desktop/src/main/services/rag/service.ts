import { LocalDocumentIndex } from 'vectra';
import type { EmbeddingsModel, EmbeddingsResponse, MetadataTypes } from 'vectra/lib/types.js';
import crypto from 'node:crypto';

export interface RAGResult {
  content: string;
  source: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingFunction {
  (texts: string[]): Promise<number[][]>;
}

class EmbeddingAdapter implements EmbeddingsModel {
  readonly maxTokens = 8192;
  private embedFn: EmbeddingFunction;

  constructor(embedFn: EmbeddingFunction) {
    this.embedFn = embedFn;
  }

  async createEmbeddings(inputs: string | string[]): Promise<EmbeddingsResponse> {
    try {
      const texts = Array.isArray(inputs) ? inputs : [inputs];
      const output = await this.embedFn(texts);
      return { status: 'success', output };
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class RAGService {
  private index: LocalDocumentIndex | null = null;
  private indexPath: string;
  private embedFn: EmbeddingFunction | null = null;

  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  setEmbedFunction(fn: EmbeddingFunction) {
    this.embedFn = fn;
  }

  async init(): Promise<void> {
    const config: ConstructorParameters<typeof LocalDocumentIndex>[0] = {
      folderPath: this.indexPath,
    };

    if (this.embedFn) {
      config.embeddings = new EmbeddingAdapter(this.embedFn);
    }

    this.index = new LocalDocumentIndex(config);

    await this.index.createIndex({
      version: 1,
    });
  }

  async addDocument(noteId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.index) throw new Error('RAGService not initialized');

    const chunks = this.chunkText(content, 512, 64);
    for (let i = 0; i < chunks.length; i++) {
      const docId = `${noteId}::chunk-${i}`;
      const chunkHash = crypto.createHash('sha256').update(chunks[i]!).digest('hex').slice(0, 12);

      try {
        const meta: Record<string, MetadataTypes> = {
          noteId,
          chunkIndex: i,
          chunkHash,
          totalChunks: chunks.length,
        };
        if (metadata) {
          for (const [k, v] of Object.entries(metadata)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              meta[k] = v;
            }
          }
        }
        await this.index.upsertDocument(docId, chunks[i]!, undefined, meta);
      } catch (err) {
        console.warn('Failed to add document chunk:', err);
      }
    }
  }

  async removeDocument(noteId: string): Promise<void> {
    if (!this.index) throw new Error('RAGService not initialized');

    try {
      const docs = await this.index.listDocuments();
      for (const doc of docs) {
        const docId = doc.id ?? doc.uri;
        if (docId.startsWith(`${noteId}::`)) {
          await this.index.deleteDocument(docId);
        }
      }
    } catch (err) {
      console.warn('Failed to remove document:', err);
    }
  }

  async query(query: string, topK: number = 5): Promise<RAGResult[]> {
    if (!this.index) throw new Error('RAGService not initialized');

    const results = await this.index.queryDocuments(query, {
      maxDocuments: topK,
    });

    const ragResults: RAGResult[] = [];
    for (const r of results) {
      const text = await r.loadText();
      const meta = await r.loadMetadata();
      ragResults.push({
        content: text,
        source: r.id ?? r.uri ?? '',
        score: r.score ?? 0,
        metadata: meta as Record<string, unknown> | undefined,
      });
    }

    return ragResults;
  }

  async hybridQuery(query: string, topK: number = 5, graphResults?: string[]): Promise<RAGResult[]> {
    const vectorResults = await this.query(query, topK * 2);

    const scored = new Map<string, { result: RAGResult; score: number }>();

    for (const r of vectorResults) {
      const key = r.source;
      const existing = scored.get(key);
      const combinedScore = r.score * 0.7 + (graphResults?.includes(r.source) ? 0.3 : 0);
      if (!existing || combinedScore > existing.score) {
        scored.set(key, { result: r, score: combinedScore });
      }
    }

    if (graphResults) {
      for (const noteId of graphResults) {
        if (!scored.has(noteId)) {
          scored.set(noteId, {
            result: { content: '', source: noteId, score: 0.3 },
            score: 0.3,
          });
        } else {
          const existing = scored.get(noteId)!;
          existing.score += 0.3;
        }
      }
    }

    return Array.from(scored.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => ({ ...s.result, score: s.score }));
  }

  async indexVault(vaultPath: string, fileEntries: Array<{ noteId: string; filePath: string }>): Promise<{ indexed: number; skipped: number }> {
    if (!this.index) throw new Error('RAGService not initialized');

    const fsMod = await import('node:fs/promises');
    let indexed = 0;
    let skipped = 0;

    for (const entry of fileEntries) {
      try {
        const content = await fsMod.readFile(entry.filePath, 'utf-8');
        await this.addDocument(entry.noteId, content, { filePath: entry.filePath });
        indexed++;
      } catch {
        skipped++;
      }
    }

    return { indexed, skipped };
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        const words = currentChunk.split(' ');
        currentChunk = words.slice(-Math.ceil(overlap / 5)).join(' ') + '\n\n';
      }
      currentChunk += para + '\n\n';
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
