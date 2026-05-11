import { RAGService, type RAGResult } from './service.js';
import { BM25Index } from './bm25.js';

export interface HybridSearchResult extends RAGResult {
  vectorScore: number;
  bm25Score: number;
  graphBoost: number;
  combinedScore: number;
}

export class HybridSearchEngine {
  private ragService: RAGService;
  private bm25Index: BM25Index;
  private graphNeighbors: Map<string, string[]>;

  constructor(ragService: RAGService) {
    this.ragService = ragService;
    this.bm25Index = new BM25Index();
    this.graphNeighbors = new Map();
  }

  setGraphNeighbors(noteId: string, neighbors: string[]): void {
    this.graphNeighbors.set(noteId, neighbors);
  }

  addDocument(noteId: string, content: string): void {
    this.bm25Index.addDocument(noteId, content);
  }

  removeDocument(noteId: string): void {
    this.bm25Index.removeDocument(noteId);
  }

  async search(query: string, topK: number = 5): Promise<HybridSearchResult[]> {
    const [vectorResults, bm25Results] = await Promise.all([
      this.ragService.query(query, topK * 2).catch(() => [] as RAGResult[]),
      Promise.resolve(this.bm25Index.query(query, topK * 2)),
    ]);

    const candidateMap = new Map<string, HybridSearchResult>();

    const maxVecScore = Math.max(...vectorResults.map((r) => r.score), 0.001);
    for (const r of vectorResults) {
      const normalized = r.score / maxVecScore;
      candidateMap.set(r.source, {
        content: r.content,
        source: r.source,
        score: normalized,
        vectorScore: normalized,
        bm25Score: 0,
        graphBoost: 0,
        combinedScore: 0,
      });
    }

    const maxBm25Score = Math.max(...bm25Results.map((r) => r.score), 0.001);
    for (const r of bm25Results) {
      const normalized = r.score / maxBm25Score;
      const existing = candidateMap.get(r.id);
      if (existing) {
        existing.bm25Score = normalized;
      } else {
        candidateMap.set(r.id, {
          content: '',
          source: r.id,
          score: 0,
          vectorScore: 0,
          bm25Score: normalized,
          graphBoost: 0,
          combinedScore: 0,
        });
      }
    }

    const queryNeighbors = this.findQueryRelatedNotes(query);
    for (const [noteId, candidate] of candidateMap) {
      if (queryNeighbors.has(noteId)) {
        candidate.graphBoost = 0.2;
      }
      candidate.combinedScore = candidate.vectorScore * 0.5 + candidate.bm25Score * 0.3 + candidate.graphBoost;
    }

    return Array.from(candidateMap.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);
  }

  assembleContext(results: HybridSearchResult[], maxTokens: number = 4000): string {
    const approxTokensPerChar = 0.25;
    const maxChars = maxTokens / approxTokensPerChar;
    let context = '';
    let usedResults = 0;

    for (const r of results) {
      const entry = `[${r.source}]: ${r.content}\n\n`;
      if (context.length + entry.length > maxChars) break;
      context += entry;
      usedResults++;
    }

    return context.trim();
  }

  private findQueryRelatedNotes(query: string): Set<string> {
    const related = new Set<string>();
    const queryLower = query.toLowerCase();

    for (const [noteId, neighbors] of this.graphNeighbors) {
      if (queryLower.includes(noteId.toLowerCase())) {
        for (const n of neighbors) {
          related.add(n);
        }
      }
    }

    return related;
  }
}
