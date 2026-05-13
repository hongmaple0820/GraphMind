import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseMarkdown, pathToNoteId } from '@shared/parser/markdown.js';

interface IndexEntry {
  noteId: string;
  filePath: string;
  contentHash: string;
  mtime: number;
  paragraphs: ParagraphEntry[];
}

interface ParagraphEntry {
  index: number;
  hash: string;
  text: string;
  embedding?: number[];
}

interface IndexDiff {
  added: string[];
  modified: string[];
  deleted: string[];
  paragraphChanges: Map<string, { added: number; modified: number; deleted: number }>;
}

export class IncrementalIndexer {
  private index = new Map<string, IndexEntry>();
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  static contentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  static paragraphHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim()).digest('hex').slice(0, 12);
  }

  static splitParagraphs(content: string): string[] {
    const blocks = content.split(/\n{2,}/);
    return blocks.map((b) => b.trim()).filter((b) => b.length > 0);
  }

  async computeDiff(): Promise<IndexDiff> {
    const diff: IndexDiff = {
      added: [],
      modified: [],
      deleted: [],
      paragraphChanges: new Map(),
    };

    const currentFiles = await this.scanVault();
    const currentMap = new Map(currentFiles.map((f) => [f.noteId, f]));
    const indexedIds = new Set(this.index.keys());

    for (const [noteId, file] of currentMap) {
      if (!indexedIds.has(noteId)) {
        diff.added.push(noteId);
      } else {
        const existing = this.index.get(noteId)!;
        if (file.contentHash !== existing.contentHash) {
          diff.modified.push(noteId);
          const changes = await this.computeParagraphDiff(noteId, file.content);
          diff.paragraphChanges.set(noteId, changes);
        }
      }
    }

    for (const noteId of indexedIds) {
      if (!currentMap.has(noteId)) {
        diff.deleted.push(noteId);
      }
    }

    return diff;
  }

  private async computeParagraphDiff(noteId: string, newContent: string): Promise<{ added: number; modified: number; deleted: number }> {
    const existing = this.index.get(noteId);
    const newParagraphs = IncrementalIndexer.splitParagraphs(newContent);
    const newHashMap = new Map(newParagraphs.map((p, i) => [IncrementalIndexer.paragraphHash(p), i]));
    const oldHashMap = new Map((existing?.paragraphs ?? []).map((p) => [p.hash, p.index]));

    let added = 0;
    let modified = 0;
    let deleted = 0;

    for (const [hash, idx] of newHashMap) {
      if (!oldHashMap.has(hash)) {
        const oldParagraphs = existing?.paragraphs ?? [];
        const sameIndex = oldParagraphs.find((p) => p.index === idx);
        if (sameIndex && sameIndex.hash !== hash) {
          modified++;
        } else {
          added++;
        }
      }
    }

    for (const [hash] of oldHashMap) {
      if (!newHashMap.has(hash)) {
        deleted++;
      }
    }

    return { added, modified, deleted };
  }

  async updateIndex(diff?: IndexDiff): Promise<{ totalIndexed: number; newEntries: number; updatedEntries: number; removedEntries: number }> {
    const d = diff ?? await this.computeDiff();
    let newEntries = 0;
    let updatedEntries = 0;

    const currentFiles = await this.scanVault();
    const filesMap = new Map(currentFiles.map((f) => [f.noteId, f]));

    for (const noteId of d.added) {
      const file = filesMap.get(noteId);
      if (file) {
        const entry = await this.buildEntryFromScan(file);
        if (entry) {
          this.index.set(noteId, entry);
          newEntries++;
        }
      }
    }

    for (const noteId of d.modified) {
      const file = filesMap.get(noteId);
      if (file) {
        const entry = await this.buildEntryFromScan(file);
        if (entry) {
          this.index.set(noteId, entry);
          updatedEntries++;
        }
      }
    }

    for (const noteId of d.deleted) {
      this.index.delete(noteId);
    }

    return {
      totalIndexed: this.index.size,
      newEntries,
      updatedEntries,
      removedEntries: d.deleted.length,
    };
  }

  async fullReindex(): Promise<number> {
    this.index.clear();
    const files = await this.scanVault();

    for (const file of files) {
      const entry = await this.buildEntryFromScan(file);
      if (entry) {
        this.index.set(file.noteId, entry);
      }
    }

    return this.index.size;
  }

  getEntry(noteId: string): IndexEntry | undefined {
    return this.index.get(noteId);
  }

  getAllEntries(): IndexEntry[] {
    return Array.from(this.index.values());
  }

  getModifiedParagraphs(noteId: string): ParagraphEntry[] {
    const entry = this.index.get(noteId);
    return entry?.paragraphs ?? [];
  }

  async batchEmbed(noteIds: string[], embedFn: (texts: string[]) => Promise<number[][]>): Promise<void> {
    const texts: string[] = [];
    const targets: { noteId: string; paragraphIdx: number }[] = [];

    for (const noteId of noteIds) {
      const entry = this.index.get(noteId);
      if (!entry) continue;
      for (let i = 0; i < entry.paragraphs.length; i++) {
        const para = entry.paragraphs[i]!;
        if (!para.embedding) {
          texts.push(para.text);
          targets.push({ noteId, paragraphIdx: i });
        }
      }
    }

    if (texts.length === 0) return;

    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await embedFn(batch);

      for (let j = 0; j < embeddings.length; j++) {
        const target = targets[i + j];
        if (!target) continue;
        const entry = this.index.get(target.noteId);
        if (entry && entry.paragraphs[target.paragraphIdx]) {
          entry.paragraphs[target.paragraphIdx]!.embedding = embeddings[j];
        }
      }
    }
  }

  private async scanVault(): Promise<Array<{ noteId: string; filePath: string; contentHash: string; content: string }>> {
    const results: Array<{ noteId: string; filePath: string; contentHash: string; content: string }> = [];
    await this.scanDir(this.vaultPath, results);
    return results;
  }

  private async scanDir(dirPath: string, results: Array<{ noteId: string; filePath: string; contentHash: string; content: string }>): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await this.scanDir(fullPath, results);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          results.push({
            noteId: pathToNoteId(fullPath),
            filePath: fullPath,
            contentHash: IncrementalIndexer.contentHash(content),
            content,
          });
        } catch {
          // skip unreadable
        }
      }
    }
  }

  private async buildEntry(noteId: string): Promise<IndexEntry | null> {
    const existing = this.index.get(noteId);
    const filePath = existing?.filePath ?? '';
    if (!filePath) return null;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stat = await fs.stat(filePath);
      const paragraphs = IncrementalIndexer.splitParagraphs(content).map((text, i) => ({
        index: i,
        hash: IncrementalIndexer.paragraphHash(text),
        text,
      }));

      return {
        noteId,
        filePath,
        contentHash: IncrementalIndexer.contentHash(content),
        mtime: stat.mtimeMs,
        paragraphs,
      };
    } catch {
      return null;
    }
  }

  private async buildEntryFromScan(file: { noteId: string; filePath: string; contentHash: string; content: string }): Promise<IndexEntry | null> {
    try {
      const stat = await fs.stat(file.filePath);
      const paragraphs = IncrementalIndexer.splitParagraphs(file.content).map((text, i) => ({
        index: i,
        hash: IncrementalIndexer.paragraphHash(text),
        text,
      }));

      return {
        noteId: file.noteId,
        filePath: file.filePath,
        contentHash: file.contentHash,
        mtime: stat.mtimeMs,
        paragraphs,
      };
    } catch {
      return null;
    }
  }
}
