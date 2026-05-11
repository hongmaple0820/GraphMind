interface BM25Doc {
  id: string;
  tokens: string[];
  termFreqs: Map<string, number>;
  length: number;
}

export class BM25Index {
  private docs = new Map<string, BM25Doc>();
  private avgDocLength = 0;
  private docCount = 0;
  private df = new Map<string, number>();
  private k1 = 1.5;
  private b = 0.75;

  addDocument(id: string, text: string): void {
    const tokens = this.tokenize(text);
    const termFreqs = new Map<string, number>();

    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
    }

    const existing = this.docs.get(id);
    if (existing) {
      for (const [term] of existing.termFreqs) {
        this.df.set(term, (this.df.get(term) ?? 1) - 1);
      }
      this.docCount--;
    }

    this.docs.set(id, { id, tokens, termFreqs, length: tokens.length });

    for (const [term] of termFreqs) {
      this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
    this.docCount++;
    this.recalcAvg();
  }

  removeDocument(id: string): void {
    const doc = this.docs.get(id);
    if (!doc) return;

    for (const [term] of doc.termFreqs) {
      this.df.set(term, Math.max(0, (this.df.get(term) ?? 1) - 1));
    }
    this.docs.delete(id);
    this.docCount--;
    this.recalcAvg();
  }

  query(query: string, topK: number = 10): Array<{ id: string; score: number }> {
    const queryTokens = this.tokenize(query);
    const scores = new Map<string, number>();

    for (const qt of queryTokens) {
      const idf = this.computeIDF(qt);

      for (const doc of this.docs.values()) {
        const tf = doc.termFreqs.get(qt) ?? 0;
        if (tf === 0) continue;

        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength)));
        const score = idf * tfNorm;
        scores.set(doc.id, (scores.get(doc.id) ?? 0) + score);
      }
    }

    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private computeIDF(term: string): number {
    const df = this.df.get(term) ?? 0;
    if (df === 0 || this.docCount === 0) return 0;
    return Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);
  }

  private recalcAvg(): void {
    if (this.docCount === 0) {
      this.avgDocLength = 0;
      return;
    }
    let total = 0;
    for (const doc of this.docs.values()) {
      total += doc.length;
    }
    this.avgDocLength = total / this.docCount;
  }

  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    const latinWords = text.toLowerCase().replace(/[^\w]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
    tokens.push(...latinWords);

    const chineseChars = text.match(/[\u4e00-\u9fff]+/g) ?? [];
    for (const segment of chineseChars) {
      for (let i = 0; i < segment.length - 1; i++) {
        tokens.push(segment.slice(i, i + 2));
      }
    }

    return tokens;
  }
}
