import type { IpcMain, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FSWatcher } from 'node:fs';
import { parseMarkdown, pathToNoteId, type ParseResult } from '@shared/parser/markdown.js';
import { IncrementalIndexer } from '../services/indexer/incremental.js';

interface NoteMeta {
  id: string;
  title: string;
  filePath: string;
  tags: string[];
  updatedAt: number;
  createdAt: number;
}

const notesIndex = new Map<string, NoteMeta>();
const parseCache = new Map<string, ParseResult>();
let incrementalIndexer: IncrementalIndexer | null = null;
let watcher: FSWatcher | null = null;

function getIndexer(vaultPath: string): IncrementalIndexer {
  if (!incrementalIndexer) {
    incrementalIndexer = new IncrementalIndexer(vaultPath);
  }
  return incrementalIndexer;
}

export function registerFileHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow) {

  ipcMain.handle('file:read', async (_event, args: { path: string }) => {
    try {
      const content = await fs.readFile(args.path, 'utf-8');
      return { content, encoding: 'utf-8' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: '', encoding: 'utf-8', error: msg };
    }
  });

  ipcMain.handle('file:write', async (_event, args: { path: string; content: string }) => {
    await fs.mkdir(path.dirname(args.path), { recursive: true });
    await fs.writeFile(args.path, args.content, 'utf-8');

    const noteId = pathToNoteId(args.path);
    const parseResult = parseMarkdown(args.content);
    parseCache.set(noteId, parseResult);

    const stat = await fs.stat(args.path);
    notesIndex.set(noteId, {
      id: noteId,
      title: parseResult.title || noteId,
      filePath: args.path,
      tags: [
        ...(parseResult.frontmatter?.tags ?? []),
        ...parseResult.tags.map((t: { name: string }) => t.name),
      ],
      updatedAt: stat.mtimeMs,
      createdAt: stat.birthtimeMs,
    });

    mainWindow.webContents.send('graph:updated', { type: 'node-updated', nodeId: noteId });
    return { success: true };
  });

  ipcMain.handle('file:list', async (_event, args: { path: string }) => {
    const vaultPath = args.path;
    const entries = await scanMarkdownFiles(vaultPath);
    return entries;
  });

  ipcMain.handle('file:create', async (_event, args: { vaultPath: string; title: string; content?: string }) => {
    const fileName = args.title.replace(/[/\\?%*:|"<>]/g, '-') + '.md';
    const filePath = path.join(args.vaultPath, fileName);
    const content = args.content ?? `# ${args.title}\n\n`;
    await fs.writeFile(filePath, content, 'utf-8');

    const noteId = pathToNoteId(filePath);
    const parseResult = parseMarkdown(content);
    parseCache.set(noteId, parseResult);
    notesIndex.set(noteId, {
      id: noteId,
      title: args.title,
      filePath,
      tags: parseResult.frontmatter?.tags ?? [],
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    mainWindow.webContents.send('graph:updated', { type: 'node-added', nodeId: noteId });
    return { path: filePath, noteId };
  });

  ipcMain.handle('file:parse', async (_event, args: { path: string }) => {
    const content = await fs.readFile(args.path, 'utf-8');
    const result = parseMarkdown(content);
    const noteId = pathToNoteId(args.path);
    parseCache.set(noteId, result);
    return result;
  });

  ipcMain.handle('file:get-index', async () => {
    return Array.from(notesIndex.values());
  });

  ipcMain.handle('file:index-vault', async (_event, args: { vaultPath: string }) => {
    const indexer = getIndexer(args.vaultPath);
    await indexer.fullReindex();

    const entries = await scanMarkdownFiles(args.vaultPath);
    for (const entry of entries) {
      try {
        const content = await fs.readFile(entry.path, 'utf-8');
        const result = parseMarkdown(content);
        const noteId = pathToNoteId(entry.path);
        parseCache.set(noteId, result);
        const stat = await fs.stat(entry.path);
        notesIndex.set(noteId, {
          id: noteId,
          title: result.title || noteId,
          filePath: entry.path,
          tags: [
            ...(result.frontmatter?.tags ?? []),
            ...result.tags.map((t: { name: string }) => t.name),
          ],
          updatedAt: stat.mtimeMs,
          createdAt: stat.birthtimeMs,
        });
      } catch (err) {
        console.warn('Failed to index file during vault scan:', err);
      }
    }
    return Array.from(notesIndex.values());
  });

  ipcMain.handle('file:watch', async (_event, args: { path: string }) => {
    if (watcher) {
      try { watcher.close(); } catch { /* ignore */ }
    }

    try {
      const { watch } = await import('node:fs');
      watcher = watch(args.path, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.md') || filename.endsWith('.markdown'))) {
          mainWindow.webContents.send('file:watch-event', {
            event: eventType,
            path: path.join(args.path, filename),
          });
        }
      });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('file:incremental-index', async (_event, args: { vaultPath: string }) => {
    const indexer = getIndexer(args.vaultPath);
    const diff = await indexer.computeDiff();

    if (diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0) {
      return { status: 'up-to-date', total: notesIndex.size };
    }

    const result = await indexer.updateIndex(diff);

    for (const noteId of [...diff.added, ...diff.modified]) {
      const entry = indexer.getEntry(noteId);
      if (!entry) continue;
      try {
        const content = await fs.readFile(entry.filePath, 'utf-8');
        const parseResult = parseMarkdown(content);
        parseCache.set(noteId, parseResult);
        const stat = await fs.stat(entry.filePath);
        notesIndex.set(noteId, {
          id: noteId,
          title: parseResult.title || noteId,
          filePath: entry.filePath,
          tags: [
            ...(parseResult.frontmatter?.tags ?? []),
            ...parseResult.tags.map((t: { name: string }) => t.name),
          ],
          updatedAt: stat.mtimeMs,
          createdAt: stat.birthtimeMs,
        });
      } catch (err) {
        console.warn('Failed to index file during incremental update:', err);
      }
    }

    for (const noteId of diff.deleted) {
      notesIndex.delete(noteId);
      parseCache.delete(noteId);
    }

    return {
      status: 'updated',
      added: diff.added.length,
      modified: diff.modified.length,
      deleted: diff.deleted.length,
      total: result.totalIndexed,
      paragraphChanges: Object.fromEntries(
        Array.from(diff.paragraphChanges.entries()).map(([k, v]) => [k, v]),
      ),
    };
  });
}

async function scanMarkdownFiles(dirPath: string): Promise<{ name: string; path: string }[]> {
  const results: { name: string; path: string }[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const subResults = await scanMarkdownFiles(fullPath);
        results.push(...subResults);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        results.push({ name: entry.name, path: fullPath });
      }
    }
  } catch {
    // directory not accessible
  }
  return results;
}

export { notesIndex, parseCache };
