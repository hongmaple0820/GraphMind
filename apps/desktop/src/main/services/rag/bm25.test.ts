import { describe, it, expect } from 'vitest';
import { BM25Index } from './bm25.js';

describe('BM25Index', () => {
  it('should add and query documents', () => {
    const index = new BM25Index();
    index.addDocument('note1', 'GraphMind is a knowledge management tool with graph visualization');
    index.addDocument('note2', 'Machine learning models can help with knowledge retrieval');
    index.addDocument('note3', 'Graph databases store interconnected data efficiently');

    const results = index.query('knowledge graph', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('note1');
  });

  it('should return empty results for no matches', () => {
    const index = new BM25Index();
    index.addDocument('note1', 'Hello world');
    const results = index.query('quantum physics', 5);
    expect(results.length).toBe(0);
  });

  it('should handle document removal', () => {
    const index = new BM25Index();
    index.addDocument('note1', 'GraphMind knowledge base');
    index.addDocument('note2', 'Knowledge retrieval system');

    index.removeDocument('note1');
    const results = index.query('knowledge', 5);
    expect(results.every((r) => r.id !== 'note1')).toBe(true);
  });

  it('should update existing document', () => {
    const index = new BM25Index();
    index.addDocument('note1', 'Old content about cats');
    index.addDocument('note1', 'New content about dogs');
    const results = index.query('dogs', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('note1');
  });

  it('should handle Chinese text tokenization', () => {
    const index = new BM25Index();
    index.addDocument('note1', '知识图谱是一种用于表示知识的图结构数据');
    index.addDocument('note2', '机器学习可以帮助知识检索');

    const results = index.query('知识图谱', 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should respect topK limit', () => {
    const index = new BM25Index();
    for (let i = 0; i < 20; i++) {
      index.addDocument(`note${i}`, `Document ${i} about knowledge management`);
    }
    const results = index.query('knowledge', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
