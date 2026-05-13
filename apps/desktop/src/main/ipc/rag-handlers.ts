import type { IpcMain, BrowserWindow } from 'electron';
import { RAGService } from '../services/rag/service.js';
import { BM25Index } from '../services/rag/bm25.js';
import { HybridSearchEngine } from '../services/rag/hybrid.js';
import { IncrementalIndexer } from '../services/indexer/incremental.js';
import { getEmbeddingService, type EmbeddingProviderConfig } from '../services/rag/embedding.js';
import path from 'node:path';
import { getOrCreateRouter } from './agent-handlers.js';

let ragService: RAGService | null = null;
let hybridEngine: HybridSearchEngine | null = null;
let bm25Index: BM25Index | null = null;
let embeddingConfig: EmbeddingProviderConfig | null = null;

export function getSharedHybridEngine(): HybridSearchEngine | null {
  return hybridEngine;
}

async function getRAGService(vaultPath: string): Promise<RAGService> {
  if (!ragService) {
    const indexPath = path.join(vaultPath, '.graphmind', 'rag-index');
    ragService = new RAGService(indexPath);

    const embeddingService = getEmbeddingService(embeddingConfig ?? undefined);

    ragService.setEmbedFunction(async (texts: string[]) => {
      try {
        const embedFn = embeddingService.getEmbedFunction();
        return await embedFn(texts);
      } catch (err) {
        console.warn('Primary embedding failed, trying LLM provider:', err);
      }

      try {
        const router = getOrCreateRouter();
        const provider = router.getPrimaryProvider();
        if (provider && 'embed' in provider) {
          const embedFn = (provider as unknown as { embed: (t: string[]) => Promise<number[][]> }).embed;
          if (typeof embedFn === 'function') {
            return await embedFn(texts);
          }
        }
      } catch (err) {
        console.warn('LLM provider embedding failed, using deterministic fallback:', err);
      }

      const dim = 384;
      return texts.map((text) => {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
          hash = ((hash << 5) - hash) + text.charCodeAt(i);
          hash = hash & hash;
        }
        const seed = Math.abs(hash);
        const embedding = new Array(dim).fill(0);
        for (let i = 0; i < dim; i++) {
          const x = Math.sin(seed * (i + 1) * 0.0001) * 10000;
          embedding[i] = x - Math.floor(x) - 0.5;
        }
        const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
        return embedding.map((v) => v / norm);
      });
    });

    await ragService.init();
  }
  return ragService;
}

function getBM25Index(): BM25Index {
  if (!bm25Index) {
    bm25Index = new BM25Index();
  }
  return bm25Index;
}

async function getHybridEngine(vaultPath: string): Promise<HybridSearchEngine> {
  if (!hybridEngine) {
    const rag = await getRAGService(vaultPath);
    hybridEngine = new HybridSearchEngine(rag);
  }
  return hybridEngine;
}

export function registerRAGHandlers(ipcMain: IpcMain, _mainWindow: BrowserWindow) {
  ipcMain.handle('rag:query', async (_event, args: { query: string; topK?: number; vaultPath: string }) => {
    const engine = await getHybridEngine(args.vaultPath);
    const results = await engine.search(args.query, args.topK ?? 5);
    return results.map((r) => ({
      source: r.source,
      content: r.content,
      score: r.combinedScore,
      vectorScore: r.vectorScore,
      bm25Score: r.bm25Score,
    }));
  });

  ipcMain.handle('rag:bm25-query', async (_event, args: { query: string; topK?: number }) => {
    const index = getBM25Index();
    return index.query(args.query, args.topK ?? 10);
  });

  ipcMain.handle('rag:index-note', async (_event, args: { noteId: string; content: string; vaultPath: string }) => {
    const rag = await getRAGService(args.vaultPath);
    const bm25 = getBM25Index();
    const engine = await getHybridEngine(args.vaultPath);

    await rag.addDocument(args.noteId, args.content);
    bm25.addDocument(args.noteId, args.content);
    engine.addDocument(args.noteId, args.content);

    return { success: true };
  });

  ipcMain.handle('rag:remove-note', async (_event, args: { noteId: string; vaultPath: string }) => {
    const rag = await getRAGService(args.vaultPath);
    const bm25 = getBM25Index();
    const engine = await getHybridEngine(args.vaultPath);

    await rag.removeDocument(args.noteId);
    bm25.removeDocument(args.noteId);
    engine.removeDocument(args.noteId);

    return { success: true };
  });

  ipcMain.handle('rag:index-vault', async (_event, args: { vaultPath: string }) => {
    const rag = await getRAGService(args.vaultPath);
    const engine = await getHybridEngine(args.vaultPath);
    const indexer = new IncrementalIndexer(args.vaultPath);
    const count = await indexer.fullReindex();

    const entries = indexer.getAllEntries();
    const fileEntries = entries.map((e) => ({ noteId: e.noteId, filePath: e.filePath }));

    const result = await rag.indexVault(args.vaultPath, fileEntries);

    const bm25 = getBM25Index();
    for (const entry of entries) {
      const fullContent = entry.paragraphs.map((p) => p.text).join('\n\n');
      bm25.addDocument(entry.noteId, fullContent);
      engine.addDocument(entry.noteId, fullContent);
    }

    return {
      totalNotes: count,
      ragIndexed: result.indexed,
      ragSkipped: result.skipped,
    };
  });

  ipcMain.handle('rag:assemble-context', async (_event, args: { query: string; vaultPath: string; topK?: number; maxTokens?: number }) => {
    const engine = await getHybridEngine(args.vaultPath);
    const results = await engine.search(args.query, args.topK ?? 5);
    const context = engine.assembleContext(results, args.maxTokens ?? 4000);
    return { context, sources: results.map((r) => r.source) };
  });

  ipcMain.handle('rag:set-embedding-config', async (_event, args: EmbeddingProviderConfig) => {
    embeddingConfig = args;
    const service = getEmbeddingService(args);
    ragService?.setEmbedFunction(service.getEmbedFunction());
    return { success: true };
  });

  ipcMain.handle('rag:get-embedding-config', async () => {
    if (!embeddingConfig) {
      return { configured: false, type: 'local' };
    }
    return {
      configured: true,
      type: embeddingConfig.type,
      apiUrl: embeddingConfig.apiUrl,
      model: embeddingConfig.model,
      dimensions: embeddingConfig.dimensions,
      hasApiKey: !!embeddingConfig.apiKey,
    };
  });
}
