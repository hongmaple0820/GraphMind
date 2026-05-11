import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IncrementalIndexer } from './incremental.js';

describe('IncrementalIndexer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graphmind-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should compute content hash deterministically', () => {
    const hash1 = IncrementalIndexer.contentHash('hello world');
    const hash2 = IncrementalIndexer.contentHash('hello world');
    const hash3 = IncrementalIndexer.contentHash('hello world!');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('should split paragraphs correctly', () => {
    const content = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
    const paragraphs = IncrementalIndexer.splitParagraphs(content);
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe('Paragraph 1');
    expect(paragraphs[2]).toBe('Paragraph 3');
  });

  it('should detect added files in diff', async () => {
    await fs.writeFile(path.join(tmpDir, 'note1.md'), '# Note 1\n\nContent 1');
    const indexer = new IncrementalIndexer(tmpDir);
    const diff = await indexer.computeDiff();

    expect(diff.added).toHaveLength(1);
    expect(diff.modified).toHaveLength(0);
    expect(diff.deleted).toHaveLength(0);
  });

  it('should detect modified files after update', async () => {
    await fs.writeFile(path.join(tmpDir, 'note1.md'), '# Note 1\n\nContent 1');
    const indexer = new IncrementalIndexer(tmpDir);
    await indexer.updateIndex();

    await fs.writeFile(path.join(tmpDir, 'note1.md'), '# Note 1\n\nContent 1 modified');
    const diff = await indexer.computeDiff();

    expect(diff.added).toHaveLength(0);
    expect(diff.modified).toHaveLength(1);
    expect(diff.deleted).toHaveLength(0);
  });

  it('should detect deleted files in diff', async () => {
    const filePath = path.join(tmpDir, 'note1.md');
    await fs.writeFile(filePath, '# Note 1\n\nContent 1');
    const indexer = new IncrementalIndexer(tmpDir);
    await indexer.updateIndex();

    await fs.unlink(filePath);
    const diff = await indexer.computeDiff();

    expect(diff.deleted).toHaveLength(1);
  });

  it('should perform full reindex', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), '# A\n\nContent A');
    await fs.writeFile(path.join(tmpDir, 'b.md'), '# B\n\nContent B');

    const indexer = new IncrementalIndexer(tmpDir);
    const count = await indexer.fullReindex();

    expect(count).toBe(2);
    expect(indexer.getAllEntries()).toHaveLength(2);
  });

  it('should update index with diff', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), '# A\n\nContent A');
    const indexer = new IncrementalIndexer(tmpDir);

    const diff = await indexer.computeDiff();
    const result = await indexer.updateIndex(diff);

    expect(result.newEntries).toBe(1);
    expect(result.totalIndexed).toBe(1);
  });

  it('should track paragraph changes', async () => {
    await fs.writeFile(path.join(tmpDir, 'note1.md'), '# Note\n\nPara 1\n\nPara 2');
    const indexer = new IncrementalIndexer(tmpDir);
    await indexer.updateIndex();

    await fs.writeFile(path.join(tmpDir, 'note1.md'), '# Note\n\nPara 1 modified\n\nPara 2\n\nPara 3');
    const diff = await indexer.computeDiff();

    expect(diff.paragraphChanges.size).toBe(1);
    const changes = Array.from(diff.paragraphChanges.values())[0];
    expect(changes.added + changes.modified).toBeGreaterThan(0);
  });

  it('should handle empty vault', async () => {
    const indexer = new IncrementalIndexer(tmpDir);
    const diff = await indexer.computeDiff();
    expect(diff.added).toHaveLength(0);
    expect(diff.deleted).toHaveLength(0);

    const count = await indexer.fullReindex();
    expect(count).toBe(0);
  });
});
