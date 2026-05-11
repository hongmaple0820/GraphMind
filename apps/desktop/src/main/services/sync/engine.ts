import { createClient, type WebDAVClient, type FileStat } from 'webdav';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SyncFileEntry {
  path: string;
  mtime: number;
  etag?: string;
  hash: string;
  size: number;
}

export type SyncAction = 'upload' | 'download' | 'conflict' | 'skip' | 'delete-local' | 'delete-remote';

export interface SyncDecision {
  path: string;
  action: SyncAction;
  localEntry?: SyncFileEntry;
  remoteEntry?: SyncFileEntry;
  baseEntry?: SyncFileEntry;
}

export type ConflictStrategy = 'local-wins' | 'remote-wins' | 'both-keep' | 'skip';

interface SyncProgress {
  phase: 'scanning' | 'comparing' | 'uploading' | 'downloading' | 'resolving' | 'done';
  completed: number;
  total: number;
  currentFile?: string;
}

export interface ChunkedUploadState {
  relativePath: string;
  totalChunks: number;
  uploadedChunks: number[];
  uploadId: string;
}

export class SyncEngine {
  private client: WebDAVClient;
  private remoteBasePath: string;
  private localBasePath: string;
  private onProgress?: (progress: SyncProgress) => void;
  private chunkSize: number;
  private pendingUploads: Map<string, ChunkedUploadState>;
  private stateFilePath: string;

  constructor(config: { url: string; username: string; password?: string; remotePath: string; localPath: string }) {
    this.client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
    this.remoteBasePath = config.remotePath.replace(/\/$/, '');
    this.localBasePath = config.localPath.replace(/\/$/, '');
    this.chunkSize = 512 * 1024;
    this.pendingUploads = new Map();
    this.stateFilePath = path.join(this.localBasePath, '.graphmind', 'sync-state.json');
  }

  onProgressUpdate(callback: (progress: SyncProgress) => void) {
    this.onProgress = callback;
  }

  async scanRemote(): Promise<Map<string, SyncFileEntry>> {
    this.emitProgress({ phase: 'scanning', completed: 0, total: 0 });
    const index = new Map<string, SyncFileEntry>();
    await this.scanRemoteDir(this.remoteBasePath, index);
    return index;
  }

  private async scanRemoteDir(dirPath: string, index: Map<string, SyncFileEntry>): Promise<void> {
    let items: FileStat[];
    try {
      items = await this.client.getDirectoryContents(dirPath) as FileStat[];
    } catch {
      return;
    }

    for (const item of items) {
      if (item.type === 'directory') {
        await this.scanRemoteDir(item.filename, index);
      } else if (item.basename.endsWith('.md') || item.basename.endsWith('.markdown')) {
        const relativePath = item.filename.slice(this.remoteBasePath.length + 1);
        index.set(relativePath, {
          path: relativePath,
          mtime: new Date(item.lastmod).getTime(),
          etag: item.etag ?? undefined,
          hash: item.etag ?? '',
          size: item.size,
        });
      }
    }
  }

  async scanLocal(): Promise<Map<string, SyncFileEntry>> {
    const index = new Map<string, SyncFileEntry>();
    await this.scanLocalDir(this.localBasePath, index);
    return index;
  }

  private async scanLocalDir(dirPath: string, index: Map<string, SyncFileEntry>): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await this.scanLocalDir(fullPath, index);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        const relativePath = fullPath.slice(this.localBasePath.length + 1);
        const stat = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

        index.set(relativePath, {
          path: relativePath,
          mtime: stat.mtimeMs,
          hash,
          size: stat.size,
        });
      }
    }
  }

  computeSyncPlan(
    localIndex: Map<string, SyncFileEntry>,
    remoteIndex: Map<string, SyncFileEntry>,
    baseIndex: Map<string, SyncFileEntry> = new Map(),
  ): SyncDecision[] {
    const decisions: SyncDecision[] = [];
    const allPaths = new Set([...localIndex.keys(), ...remoteIndex.keys()]);

    for (const filePath of allPaths) {
      const local = localIndex.get(filePath);
      const remote = remoteIndex.get(filePath);
      const base = baseIndex.get(filePath);

      if (!local && remote) {
        decisions.push({ path: filePath, action: 'download', remoteEntry: remote });
      } else if (local && !remote) {
        decisions.push({ path: filePath, action: 'upload', localEntry: local });
      } else if (local && remote) {
        if (local.hash === remote.hash) {
          decisions.push({ path: filePath, action: 'skip', localEntry: local, remoteEntry: remote });
        } else if (base && local.hash === base.hash) {
          decisions.push({ path: filePath, action: 'download', localEntry: local, remoteEntry: remote, baseEntry: base });
        } else if (base && remote.hash === base.hash) {
          decisions.push({ path: filePath, action: 'upload', localEntry: local, remoteEntry: remote, baseEntry: base });
        } else {
          decisions.push({ path: filePath, action: 'conflict', localEntry: local, remoteEntry: remote, baseEntry: base });
        }
      }
    }

    return decisions;
  }

  async executeSync(decisions: SyncDecision[], conflictStrategy: ConflictStrategy = 'local-wins'): Promise<{ uploaded: number; downloaded: number; conflicts: number; skipped: number }> {
    const result = { uploaded: 0, downloaded: 0, conflicts: 0, skipped: 0 };
    this.emitProgress({ phase: 'comparing', completed: 0, total: decisions.length });

    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      if (!decision) continue;
      this.emitProgress({ phase: 'uploading', completed: i, total: decisions.length, currentFile: decision.path });

      switch (decision.action) {
        case 'upload':
          await this.uploadFile(decision.path);
          result.uploaded++;
          break;

        case 'download':
          await this.downloadFile(decision.path);
          result.downloaded++;
          break;

        case 'conflict':
          await this.resolveConflict(decision, conflictStrategy);
          result.conflicts++;
          break;

        case 'skip':
          result.skipped++;
          break;
      }
    }

    this.emitProgress({ phase: 'done', completed: decisions.length, total: decisions.length });
    return result;
  }

  private async resolveConflict(decision: SyncDecision, strategy: ConflictStrategy): Promise<void> {
    await this.createBackup(decision.path);

    switch (strategy) {
      case 'local-wins':
        await this.uploadFile(decision.path);
        break;
      case 'remote-wins':
        await this.downloadFile(decision.path);
        break;
      case 'both-keep': {
        const remoteContent = await this.client.getFileContents(`${this.remoteBasePath}/${decision.path}`, { format: 'text' });
        const conflictPath = decision.path.replace(/\.md$/, '.conflict.md');
        await fs.mkdir(path.dirname(path.join(this.localBasePath, conflictPath)), { recursive: true });
        await fs.writeFile(path.join(this.localBasePath, conflictPath), remoteContent as string, 'utf-8');
        await this.uploadFile(decision.path);
        break;
      }
      case 'skip':
        break;
    }
  }

  private async uploadFile(relativePath: string): Promise<void> {
    const localPath = path.join(this.localBasePath, relativePath);
    const stat = await fs.stat(localPath);

    if (stat.size > this.chunkSize) {
      await this.uploadFileChunked(relativePath);
    } else {
      await this.uploadFileSimple(relativePath);
    }
  }

  private async uploadFileSimple(relativePath: string): Promise<void> {
    const localPath = path.join(this.localBasePath, relativePath);
    const remotePath = `${this.remoteBasePath}/${relativePath}`;
    const content = await fs.readFile(localPath, 'utf-8');

    try {
      await this.client.putFileContents(remotePath, content);
    } catch {
      await this.client.createDirectory(remotePath.split('/').slice(0, -1).join('/'), { recursive: true }).catch(() => {});
      await this.client.putFileContents(remotePath, content);
    }
  }

  private async uploadFileChunked(relativePath: string): Promise<void> {
    const localPath = path.join(this.localBasePath, relativePath);
    const buffer = await fs.readFile(localPath);
    const totalChunks = Math.ceil(buffer.length / this.chunkSize);
    const uploadId = crypto.createHash('sha256').update(relativePath + buffer.length).digest('hex').slice(0, 12);

    const existing = this.pendingUploads.get(relativePath);
    const completedChunks = existing?.uploadId === uploadId ? existing.uploadedChunks : [];

    const state: ChunkedUploadState = {
      relativePath,
      totalChunks,
      uploadedChunks: completedChunks,
      uploadId,
    };

    const tempRemotePath = `${this.remoteBasePath}/${relativePath}.part`;

    for (let i = 0; i < totalChunks; i++) {
      if (completedChunks.includes(i)) continue;

      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, buffer.length);
      const chunk = buffer.slice(start, end);

      this.emitProgress({
        phase: 'uploading',
        completed: i,
        total: totalChunks,
        currentFile: `${relativePath} (chunk ${i + 1}/${totalChunks})`,
      });

      try {
        const chunkRemotePath = `${tempRemotePath}.${i}`;
        await this.client.putFileContents(chunkRemotePath, chunk);
      } catch {
        await this.client.createDirectory(tempRemotePath.split('/').slice(0, -1).join('/'), { recursive: true }).catch(() => {});
        const chunkRemotePath = `${tempRemotePath}.${i}`;
        await this.client.putFileContents(chunkRemotePath, chunk);
      }

      state.uploadedChunks.push(i);
      await this.saveUploadState(state);
    }

    const finalRemotePath = `${this.remoteBasePath}/${relativePath}`;
    const fullContent = buffer.toString('utf-8');
    await this.client.putFileContents(finalRemotePath, fullContent);

    for (let i = 0; i < totalChunks; i++) {
      try {
        await this.client.deleteFile(`${tempRemotePath}.${i}`);
      } catch {}
    }

    this.pendingUploads.delete(relativePath);
    await this.saveUploadState(null);
  }

  private async saveUploadState(state: ChunkedUploadState | null): Promise<void> {
    try {
      const stateDir = path.dirname(this.stateFilePath);
      await fs.mkdir(stateDir, { recursive: true });

      if (state) {
        this.pendingUploads.set(state.relativePath, state);
        const allStates = Array.from(this.pendingUploads.values());
        await fs.writeFile(this.stateFilePath, JSON.stringify(allStates), 'utf-8');
      } else {
        await fs.writeFile(this.stateFilePath, '[]', 'utf-8');
      }
    } catch {}
  }

  async loadPendingUploads(): Promise<void> {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      const states: ChunkedUploadState[] = JSON.parse(data);
      for (const s of states) {
        this.pendingUploads.set(s.relativePath, s);
      }
    } catch {}
  }

  async resumePendingUploads(): Promise<{ resumed: number; completed: number }> {
    await this.loadPendingUploads();
    let resumed = 0;
    let completed = 0;

    for (const [relativePath, state] of this.pendingUploads) {
      if (state.uploadedChunks.length < state.totalChunks) {
        resumed++;
        try {
          await this.uploadFileChunked(relativePath);
          completed++;
        } catch {}
      }
    }

    return { resumed, completed };
  }

  private async downloadFile(relativePath: string): Promise<void> {
    const remotePath = `${this.remoteBasePath}/${relativePath}`;
    const localPath = path.join(this.localBasePath, relativePath);
    const tempLocalPath = localPath + '.download';

    try {
      let existingBytes = 0;
      try {
        const stat = await fs.stat(tempLocalPath);
        existingBytes = stat.size;
      } catch {}

      if (existingBytes > 0) {
        const remoteStat = await this.client.stat(remotePath) as FileStat;
        if (remoteStat.size === existingBytes) {
          await fs.rename(tempLocalPath, localPath);
          return;
        }
      }

      const content = await this.client.getFileContents(remotePath, { format: 'text' });
      await fs.mkdir(path.dirname(tempLocalPath), { recursive: true });
      await fs.writeFile(tempLocalPath, content as string, 'utf-8');
      await fs.rename(tempLocalPath, localPath);
    } catch {
      const content = await this.client.getFileContents(remotePath, { format: 'text' });
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, content as string, 'utf-8');
    }
  }

  private async createBackup(relativePath: string): Promise<void> {
    const localPath = path.join(this.localBasePath, relativePath);
    const backupPath = path.join(this.localBasePath, '.sync-backup', relativePath);

    try {
      const content = await fs.readFile(localPath, 'utf-8');
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, content, 'utf-8');
    } catch {
      // file may not exist locally
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.getDirectoryContents(this.remoteBasePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private emitProgress(progress: SyncProgress) {
    this.onProgress?.(progress);
  }
}
