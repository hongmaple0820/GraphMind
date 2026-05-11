import { LocalDocumentIndex } from 'vectra';
import path from 'node:path';
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
    this.index = new LocalDocumentIndex({
      folderPath: this.indexPath,
      embeddings: this.embedFn ? {
        create: async (text: string) => {
          if (!this.embedFn) throw new Error('No embedding function');
          const results = await this.embedFn([text]);
          return results[0];
        },
      } : undefined,
    });

    await this.index.createIndex({
      version: 1,
      deleteOldData: false,
    });
  }

  async addDocument(noteId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.index) throw new Error('RAGService not initialized');

    const chunks = this.chunkText(content, 512, 64);
    for (let i = 0; i < chunks.length; i++) {
      const docId = `${noteId}::chunk-${i}`;
      const chunkHash = crypto.createHash('sha256').update(chunks[i]).digest('hex').slice(0, 12);

      try {
        await this.index.addDocument(docId, chunks[i], {
          noteId,
          chunkIndex: i,
          chunkHash,
          totalChunks: chunks.length,
          ...metadata,
        });
      } catch {
        // document may already exist
      }
    }
  }

  async removeDocument(noteId: string): Promise<void> {
    if (!this.index) throw new Error('RAGService not initialized');

    try {
      const docs = await this.index.listDocuments();
      for (const doc of docs) {
        if (doc.id.startsWith(`${noteId}::`)) {
          await this.index.deleteDocument(doc.id);
        }
      }
    } catch {}
  }

  async query(query: string, topK: number = 5): Promise<RAGResult[]> {
    if (!this.index) throw new Error('RAGService not initialized');

    const results = await this.index.queryDocuments(query, {
      topK,
    });

    return results.map((r) => ({
      content: r.document?.text ?? r.text ?? '',
      source: r.document?.meta?.noteId ?? r.id ?? '',
      score: r.score ?? 0,
      metadata: r.document?.meta as Record<string, unknown> | undefined,
    }));
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

    const fs = await import('node:fs/promises');
    let indexed = 0;
    let skipped = 0;

    for (const entry of fileEntries) {
      try {
        const content = await fs.readFile(entry.filePath, 'utf-8');
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
